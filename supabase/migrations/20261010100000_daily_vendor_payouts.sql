-- Phase 4: auditable daily vendor payout batches. All balances are derived from immutable assignment/shipping snapshots.
create table public.vendor_payouts (
 id uuid primary key default gen_random_uuid(),
 vendor_id uuid not null references public.profiles(id),
 payout_date date not null,
 status text not null default 'draft' check(status in ('draft','paid','void')),
 total bigint not null default 0 check(total>=0),
 transfer_reference text,
 paid_at timestamptz,
 paid_by uuid references public.profiles(id),
 request_id uuid not null,
 void_reason text,
 voided_at timestamptz,
 voided_by uuid references public.profiles(id),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 unique(vendor_id,request_id),
 check (
  (status='draft' and transfer_reference is null and paid_at is null and paid_by is null and void_reason is null and voided_at is null and voided_by is null)
  or (status='paid' and length(btrim(transfer_reference))>0 and paid_at is not null and paid_by is not null and void_reason is null and voided_at is null and voided_by is null)
  or (status='void' and transfer_reference is null and paid_at is null and paid_by is null and length(btrim(void_reason))>0 and voided_at is not null and voided_by is not null)
 )
);
create index vendor_payouts_vendor_history_idx on public.vendor_payouts(vendor_id,payout_date desc,created_at desc);
create index vendor_payouts_status_date_idx on public.vendor_payouts(status,payout_date desc);
alter table public.vendor_payouts enable row level security;
revoke all on public.vendor_payouts from public,anon,authenticated;
grant all on public.vendor_payouts to service_role;
create trigger vendor_payouts_touch_updated_at before update on public.vendor_payouts for each row execute function private.touch_updated_at();

create table public.vendor_payout_items (
 id uuid primary key default gen_random_uuid(),
 payout_id uuid not null references public.vendor_payouts(id),
 order_id uuid not null references public.orders(id),
 vendor_id uuid not null references public.profiles(id),
 vendor_fee_amount bigint not null check(vendor_fee_amount>=0),
 shipping_reimbursement bigint not null check(shipping_reimbursement>=0),
 total_amount bigint not null check(total_amount=vendor_fee_amount+shipping_reimbursement),
 status text not null default 'reserved' check(status in ('reserved','paid','void')),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 unique(payout_id,order_id)
);
-- Reserved and paid orders remain ineligible. Voiding the entire draft changes items to void atomically.
create unique index vendor_payout_items_one_active_order_idx on public.vendor_payout_items(order_id) where status in ('reserved','paid');
create index vendor_payout_items_vendor_status_idx on public.vendor_payout_items(vendor_id,status,created_at desc);
alter table public.vendor_payout_items enable row level security;
revoke all on public.vendor_payout_items from public,anon,authenticated;
grant all on public.vendor_payout_items to service_role;
create trigger vendor_payout_items_touch_updated_at before update on public.vendor_payout_items for each row execute function private.touch_updated_at();

create or replace function private.wib_payout_date(p_at timestamptz default clock_timestamp())
returns date language sql stable set search_path='' as $$ select (p_at at time zone 'Asia/Jakarta')::date; $$;
revoke all on function private.wib_payout_date(timestamptz) from public,anon,authenticated;

create or replace function private.enforce_vendor_payout_integrity()
returns trigger language plpgsql set search_path='' as $$
begin
 if old.status='paid' then raise exception 'Paid payout is immutable' using errcode='23514'; end if;
 if old.status='void' then raise exception 'Voided payout is immutable' using errcode='23514'; end if;
 if old.status='draft' and new.status not in ('draft','paid','void') then raise exception 'Invalid payout status transition' using errcode='23514'; end if;
 if old.status='draft' and new.status='draft' and row(new.vendor_id,new.payout_date,new.request_id) is distinct from row(old.vendor_id,old.payout_date,old.request_id) then raise exception 'Draft payout identity is immutable' using errcode='23514'; end if;
 if old.status='draft' and old.total<>0 and new.total is distinct from old.total then raise exception 'Draft payout amount is immutable' using errcode='23514'; end if;
 return new;
end $$;
revoke all on function private.enforce_vendor_payout_integrity() from public,anon,authenticated;
create trigger vendor_payouts_integrity_guard before update on public.vendor_payouts for each row execute function private.enforce_vendor_payout_integrity();

create or replace function private.enforce_vendor_payout_item_integrity()
returns trigger language plpgsql set search_path='' as $$
begin
 if old.status in ('paid','void') then raise exception 'Final payout item is immutable' using errcode='23514'; end if;
 if new.status not in ('reserved','paid','void') then raise exception 'Invalid payout item status transition' using errcode='23514'; end if;
 if row(new.payout_id,new.order_id,new.vendor_id,new.vendor_fee_amount,new.shipping_reimbursement,new.total_amount) is distinct from row(old.payout_id,old.order_id,old.vendor_id,old.vendor_fee_amount,old.shipping_reimbursement,old.total_amount) then raise exception 'Payout item amount and identity are immutable' using errcode='23514'; end if;
 return new;
end $$;
revoke all on function private.enforce_vendor_payout_item_integrity() from public,anon,authenticated;
create trigger vendor_payout_items_integrity_guard before update on public.vendor_payout_items for each row execute function private.enforce_vendor_payout_item_integrity();

create or replace function private.payout_json(p_payout_id uuid)
returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object(
  'id',p.id,'vendor_id',p.vendor_id,'vendor',jsonb_build_object('name',v.full_name,'email',v.email),'payout_date',p.payout_date,'status',p.status,'total',p.total,
  'transfer_reference',p.transfer_reference,'paid_at',p.paid_at,'paid_by',p.paid_by,'request_id',p.request_id,
  'void_reason',p.void_reason,'voided_at',p.voided_at,'voided_by',p.voided_by,'created_at',p.created_at,
  'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'order_id',i.order_id,'order_number',o.order_number,
   'vendor_fee_amount',i.vendor_fee_amount,'shipping_reimbursement',i.shipping_reimbursement,'total_amount',i.total_amount,'status',i.status) order by o.created_at,o.id)
   from public.vendor_payout_items i join public.orders o on o.id=i.order_id where i.payout_id=p.id),'[]'::jsonb)
 ) from public.vendor_payouts p join public.profiles v on v.id=p.vendor_id where p.id=p_payout_id;
$$;
revoke all on function private.payout_json(uuid) from public,anon,authenticated;

create or replace function private.admin_create_vendor_payout(p_vendor_id uuid,p_request_id uuid,p_payout_date date default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); vendor_role public.app_role; target_date date:=coalesce(p_payout_date,private.wib_payout_date()); payout public.vendor_payouts; candidate record; total_amount bigint:=0;
begin
 perform private.require_admin();
 if p_vendor_id is null or p_request_id is null then raise exception 'Vendor and request ID are required' using errcode='22023'; end if;
 if target_date>private.wib_payout_date() then raise exception 'Payout date cannot be in the future (WIB)' using errcode='23514'; end if;
 select role into vendor_role from public.profiles where id=p_vendor_id for share;
 if vendor_role is distinct from 'vendor' then raise exception 'Payout target must be an active vendor' using errcode='23514'; end if;
 -- Serializes draft creation for a vendor while the partial unique index protects every order globally.
 perform pg_advisory_xact_lock(hashtextextended(p_vendor_id::text,0));
 select * into payout from public.vendor_payouts where vendor_id=p_vendor_id and request_id=p_request_id for update;
 if found then return private.payout_json(payout.id); end if;
 insert into public.vendor_payouts(vendor_id,payout_date,request_id) values(p_vendor_id,target_date,p_request_id) returning * into payout;
 for candidate in
  select a.order_id,a.vendor_fee_amount,s.actual_shipping_cost,s.shipping_payer
  from public.order_vendor_assignments a join public.shipments s on s.order_id=a.order_id
  where a.vendor_id=p_vendor_id and s.vendor_id=p_vendor_id and s.status in ('shipped','delivered')
   and s.packing_status='packed' and s.actual_shipping_cost is not null and s.shipping_payer is not null
   and s.actual_shipping_entered_at is not null and s.actual_shipping_entered_by is not null
   and not exists(select 1 from public.vendor_payout_items existing where existing.order_id=a.order_id and existing.status in ('reserved','paid'))
  for update of a,s
 loop
  insert into public.vendor_payout_items(payout_id,order_id,vendor_id,vendor_fee_amount,shipping_reimbursement,total_amount)
  values(payout.id,candidate.order_id,p_vendor_id,candidate.vendor_fee_amount,
   case when candidate.shipping_payer='vendor' then candidate.actual_shipping_cost else 0 end,
   candidate.vendor_fee_amount+case when candidate.shipping_payer='vendor' then candidate.actual_shipping_cost else 0 end);
  total_amount:=total_amount+candidate.vendor_fee_amount+case when candidate.shipping_payer='vendor' then candidate.actual_shipping_cost else 0 end;
 end loop;
 if total_amount=0 then raise exception 'No eligible shipped orders for this vendor' using errcode='23514'; end if;
 update public.vendor_payouts set total=total_amount where id=payout.id;
 return private.payout_json(payout.id);
end $$;
revoke all on function private.admin_create_vendor_payout(uuid,uuid,date) from public,anon,authenticated;
create or replace function public.admin_create_vendor_payout(p_vendor_id uuid,p_request_id uuid,p_payout_date date default null)
returns jsonb language sql security definer set search_path='' as $$ select private.admin_create_vendor_payout(p_vendor_id,p_request_id,p_payout_date); $$;
revoke all on function public.admin_create_vendor_payout(uuid,uuid,date) from public,anon;
grant execute on function public.admin_create_vendor_payout(uuid,uuid,date) to authenticated;

create or replace function private.admin_mark_vendor_payout_paid(p_payout_id uuid,p_transfer_reference text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare payout public.vendor_payouts; reference text:=btrim(coalesce(p_transfer_reference,'')); item_total bigint; item_count integer;
begin
 perform private.require_admin();
 if length(reference)=0 or length(reference)>200 or reference ~ '[[:cntrl:]]' then raise exception 'A valid transfer reference is required' using errcode='23514'; end if;
 select * into payout from public.vendor_payouts where id=p_payout_id for update;
 if not found then raise exception 'Payout not found' using errcode='P0002'; end if;
 if payout.status='paid' then
  if payout.transfer_reference=reference then return private.payout_json(payout.id); end if;
  raise exception 'Paid payout is immutable' using errcode='23514';
 end if;
 if payout.status<>'draft' then raise exception 'Only a draft payout can be marked paid' using errcode='23514'; end if;
 perform 1 from public.vendor_payout_items where payout_id=payout.id and status='reserved' for update;
 select coalesce(sum(total_amount),0),count(*) into item_total,item_count from public.vendor_payout_items where payout_id=payout.id and status='reserved';
 if item_count=0 or item_total<>payout.total then raise exception 'Payout reservation is incomplete or total is invalid' using errcode='23514'; end if;
 update public.vendor_payout_items set status='paid' where payout_id=payout.id and status='reserved';
 update public.vendor_payouts set status='paid',transfer_reference=reference,paid_at=clock_timestamp(),paid_by=auth.uid() where id=payout.id;
 return private.payout_json(payout.id);
end $$;
revoke all on function private.admin_mark_vendor_payout_paid(uuid,text) from public,anon,authenticated;
create or replace function public.admin_mark_vendor_payout_paid(p_payout_id uuid,p_transfer_reference text)
returns jsonb language sql security definer set search_path='' as $$ select private.admin_mark_vendor_payout_paid(p_payout_id,p_transfer_reference); $$;
revoke all on function public.admin_mark_vendor_payout_paid(uuid,text) from public,anon;
grant execute on function public.admin_mark_vendor_payout_paid(uuid,text) to authenticated;

create or replace function private.admin_void_vendor_payout(p_payout_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare payout public.vendor_payouts; reason text:=btrim(coalesce(p_reason,''));
begin
 perform private.require_admin();
 if length(reason)=0 or length(reason)>500 or reason ~ '[[:cntrl:]]' then raise exception 'A valid void reason is required' using errcode='23514'; end if;
 select * into payout from public.vendor_payouts where id=p_payout_id for update;
 if not found then raise exception 'Payout not found' using errcode='P0002'; end if;
 if payout.status='void' then return private.payout_json(payout.id); end if;
 if payout.status<>'draft' then raise exception 'Paid payout cannot be voided' using errcode='23514'; end if;
 update public.vendor_payout_items set status='void' where payout_id=payout.id and status='reserved';
 update public.vendor_payouts set status='void',void_reason=reason,voided_at=clock_timestamp(),voided_by=auth.uid() where id=payout.id;
 return private.payout_json(payout.id);
end $$;
revoke all on function private.admin_void_vendor_payout(uuid,text) from public,anon,authenticated;
create or replace function public.admin_void_vendor_payout(p_payout_id uuid,p_reason text)
returns jsonb language sql security definer set search_path='' as $$ select private.admin_void_vendor_payout(p_payout_id,p_reason); $$;
revoke all on function public.admin_void_vendor_payout(uuid,text) from public,anon;
grant execute on function public.admin_void_vendor_payout(uuid,text) to authenticated;

create or replace function private.admin_vendor_payout_workspace(p_page integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.require_admin();
 if p_page is null or p_page not between 0 and 100000 then raise exception 'Invalid page' using errcode='22023'; end if;
 return jsonb_build_object(
  'today',private.wib_payout_date(),
  'outstanding_total',(select coalesce(sum(a.vendor_fee_amount+case when s.shipping_payer='vendor' then s.actual_shipping_cost else 0 end),0) from public.order_vendor_assignments a join public.shipments s on s.order_id=a.order_id where s.vendor_id=a.vendor_id and s.status in ('shipped','delivered') and s.packing_status='packed' and s.actual_shipping_cost is not null and s.shipping_payer is not null and s.actual_shipping_entered_at is not null and s.actual_shipping_entered_by is not null and not exists(select 1 from public.vendor_payout_items i where i.order_id=a.order_id and i.status in ('reserved','paid'))),
  'eligible_count',(select count(*) from public.order_vendor_assignments a join public.shipments s on s.order_id=a.order_id where s.vendor_id=a.vendor_id and s.status in ('shipped','delivered') and s.packing_status='packed' and s.actual_shipping_cost is not null and s.shipping_payer is not null and s.actual_shipping_entered_at is not null and s.actual_shipping_entered_by is not null and not exists(select 1 from public.vendor_payout_items i where i.order_id=a.order_id and i.status in ('reserved','paid'))),
  'eligible_orders',(select coalesce(jsonb_agg(to_jsonb(row) order by row.shipped_at,row.order_id),'[]'::jsonb) from (select a.order_id,o.order_number,a.vendor_id,jsonb_build_object('name',p.full_name,'email',p.email) vendor,a.vendor_fee_amount,case when s.shipping_payer='vendor' then s.actual_shipping_cost else 0 end shipping_reimbursement,a.vendor_fee_amount+case when s.shipping_payer='vendor' then s.actual_shipping_cost else 0 end total_amount,s.shipping_payer,s.actual_shipping_cost,s.shipped_at from public.order_vendor_assignments a join public.shipments s on s.order_id=a.order_id join public.orders o on o.id=a.order_id join public.profiles p on p.id=a.vendor_id where s.vendor_id=a.vendor_id and s.status in ('shipped','delivered') and s.packing_status='packed' and s.actual_shipping_cost is not null and s.shipping_payer is not null and s.actual_shipping_entered_at is not null and s.actual_shipping_entered_by is not null and not exists(select 1 from public.vendor_payout_items i where i.order_id=a.order_id and i.status in ('reserved','paid')) order by s.shipped_at,a.order_id limit 25 offset p_page*25) row),
  'payouts',(select coalesce(jsonb_agg(private.payout_json(p.id) order by p.payout_date desc,p.created_at desc),'[]'::jsonb) from (select id,payout_date,created_at from public.vendor_payouts order by payout_date desc,created_at desc limit 25 offset p_page*25) p),
  'payout_count',(select count(*) from public.vendor_payouts)
 );
end $$;
revoke all on function private.admin_vendor_payout_workspace(integer) from public,anon,authenticated;
create or replace function public.admin_vendor_payout_workspace(p_page integer default 0)
returns jsonb language sql security definer set search_path='' as $$ select private.admin_vendor_payout_workspace(p_page); $$;
revoke all on function public.admin_vendor_payout_workspace(integer) from public,anon;
grant execute on function public.admin_vendor_payout_workspace(integer) to authenticated;

create or replace function private.vendor_payout_dashboard(p_page integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
 if actor is null or not exists(select 1 from public.profiles where id=actor and role='vendor') then raise exception 'Vendor access required' using errcode='42501'; end if;
 if p_page is null or p_page not between 0 and 100000 then raise exception 'Invalid page' using errcode='22023'; end if;
 return jsonb_build_object(
  'today',private.wib_payout_date(),
  'earned_today',(select coalesce(sum(a.vendor_fee_amount+case when s.shipping_payer='vendor' then s.actual_shipping_cost else 0 end),0) from public.order_vendor_assignments a join public.shipments s on s.order_id=a.order_id where a.vendor_id=actor and s.vendor_id=actor and s.status in ('shipped','delivered') and s.packing_status='packed' and s.actual_shipping_entered_at is not null and private.wib_payout_date(s.shipped_at)=private.wib_payout_date()),
  'unpaid_total',(select coalesce(sum(i.total_amount),0) from public.vendor_payout_items i join public.vendor_payouts p on p.id=i.payout_id where i.vendor_id=actor and i.status='reserved' and p.status='draft') + (select coalesce(sum(a.vendor_fee_amount+case when s.shipping_payer='vendor' then s.actual_shipping_cost else 0 end),0) from public.order_vendor_assignments a join public.shipments s on s.order_id=a.order_id where a.vendor_id=actor and s.vendor_id=actor and s.status in ('shipped','delivered') and s.packing_status='packed' and s.actual_shipping_cost is not null and s.shipping_payer is not null and s.actual_shipping_entered_at is not null and s.actual_shipping_entered_by is not null and not exists(select 1 from public.vendor_payout_items i where i.order_id=a.order_id and i.status in ('reserved','paid'))),
  'paid_total',(select coalesce(sum(i.total_amount),0) from public.vendor_payout_items i where i.vendor_id=actor and i.status='paid'),
  'payouts',(select coalesce(jsonb_agg(private.payout_json(p.id) order by p.payout_date desc,p.created_at desc),'[]'::jsonb) from (select id,payout_date,created_at from public.vendor_payouts where vendor_id=actor order by payout_date desc,created_at desc limit 25 offset p_page*25) p),
  'count',(select count(*) from public.vendor_payouts where vendor_id=actor)
 );
end $$;
revoke all on function private.vendor_payout_dashboard(integer) from public,anon,authenticated;
create or replace function public.vendor_payout_dashboard(p_page integer default 0)
returns jsonb language sql security definer set search_path='' as $$ select private.vendor_payout_dashboard(p_page); $$;
revoke all on function public.vendor_payout_dashboard(integer) from public,anon;
grant execute on function public.vendor_payout_dashboard(integer) to authenticated;
