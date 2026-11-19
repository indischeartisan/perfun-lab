-- Read-only payout recap. A readiness timestamp is recorded only when a
-- shipment reaches every payout condition after this migration. Existing
-- assignments intentionally remain NULL: their original ready moment cannot
-- be proven from the historical row.

alter table public.order_vendor_assignments add column if not exists payout_ready_at timestamptz;
create index if not exists order_vendor_assignments_payout_ready_at_idx on public.order_vendor_assignments(payout_ready_at) where payout_ready_at is not null;

create or replace function private.capture_vendor_payout_ready_at()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status in ('shipped','delivered') and new.packing_status='packed'
    and new.actual_shipping_cost is not null and new.shipping_payer is not null
    and exists(select 1 from public.orders o where o.id=new.order_id and o.payment_status='paid')
    and (new.shipping_payer<>'vendor' or private.original_shipping_rate(new.order_id) is not null) then
   update public.order_vendor_assignments a set payout_ready_at=coalesce(a.payout_ready_at,new.shipped_at,clock_timestamp())
   where a.order_id=new.order_id and a.vendor_id=new.vendor_id and a.payout_ready_at is null;
 end if;
 return new;
end $$;
revoke all on function private.capture_vendor_payout_ready_at() from public,anon,authenticated;
drop trigger if exists shipment_payout_ready_at on public.shipments;
create trigger shipment_payout_ready_at after insert or update on public.shipments for each row execute function private.capture_vendor_payout_ready_at();

create or replace function private.capture_assignment_payout_ready_at()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.order_vendor_assignments a set payout_ready_at=clock_timestamp()
 from public.shipments s join public.orders o on o.id=s.order_id
 where a.order_id=new.order_id and a.vendor_id=new.vendor_id and a.payout_ready_at is null
   and s.order_id=a.order_id and s.vendor_id=a.vendor_id and o.payment_status='paid'
   and s.status in ('shipped','delivered') and s.packing_status='packed'
   and s.actual_shipping_cost is not null and s.shipping_payer is not null
   and (s.shipping_payer<>'vendor' or private.original_shipping_rate(o.id) is not null);
 return new;
end $$;
revoke all on function private.capture_assignment_payout_ready_at() from public,anon,authenticated;
drop trigger if exists assignment_payout_ready_at on public.order_vendor_assignments;
create trigger assignment_payout_ready_at after insert on public.order_vendor_assignments for each row execute function private.capture_assignment_payout_ready_at();

create or replace function private.vendor_payout_recap(p_vendor_id uuid,p_period text default 'day',p_anchor_date date default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare anchor_day date:=coalesce(p_anchor_date,private.wib_payout_date()); period_start date; period_end date;
begin
 if p_period not in ('day','week','month') then raise exception 'Invalid payout recap period' using errcode='22023'; end if;
 period_start:=case p_period when 'day' then anchor_day when 'week' then date_trunc('week',anchor_day)::date else date_trunc('month',anchor_day)::date end;
 period_end:=case p_period when 'day' then period_start+1 when 'week' then period_start+7 else (period_start+interval '1 month')::date end;
 return (
  with eligible as (
   select a.order_id,a.vendor_id,a.vendor_fee_amount,a.payout_ready_at,s.shipping_payer::text shipping_payer,
    case when s.shipping_payer='vendor' then private.original_shipping_rate(o.id) else 0 end shipping_reimbursement,
    private.original_shipping_rate(o.id) original_shipping_amount
   from public.order_vendor_assignments a join public.shipments s on s.order_id=a.order_id and s.vendor_id=a.vendor_id join public.orders o on o.id=a.order_id
   where (p_vendor_id is null or a.vendor_id=p_vendor_id) and o.payment_status='paid'
    and s.status in ('shipped','delivered') and s.packing_status='packed' and s.actual_shipping_cost is not null and s.shipping_payer is not null
    and (s.shipping_payer<>'vendor' or private.original_shipping_rate(o.id) is not null)
    and not exists(select 1 from public.vendor_payout_items i where i.order_id=a.order_id and i.status in ('reserved','paid'))
  ), review as (
   select a.order_id,a.vendor_id,a.vendor_fee_amount,a.payout_ready_at,s.shipping_payer::text shipping_payer,
    case when s.shipping_payer is null then 'Pembayar ongkir belum tercatat' when s.actual_shipping_cost is null then 'Ongkir aktual belum tercatat' else 'Tarif RajaOngkir sebelum voucher tidak tersimpan' end review_reason
   from public.order_vendor_assignments a join public.shipments s on s.order_id=a.order_id and s.vendor_id=a.vendor_id join public.orders o on o.id=a.order_id
   where (p_vendor_id is null or a.vendor_id=p_vendor_id) and o.payment_status='paid' and s.status in ('shipped','delivered') and s.packing_status='packed'
    and (s.shipping_payer is null or s.actual_shipping_cost is null or (s.shipping_payer='vendor' and private.original_shipping_rate(o.id) is null))
    and not exists(select 1 from public.vendor_payout_items i where i.order_id=a.order_id and i.status in ('reserved','paid'))
  ), rows as (
   select e.*,o.order_number,jsonb_build_object('name',p.full_name,'email',p.email) vendor,
    (e.payout_ready_at at time zone 'Asia/Jakarta')::date ready_date
   from eligible e join public.orders o on o.id=e.order_id join public.profiles p on p.id=e.vendor_id
  ), selected as (select * from rows where ready_date>=period_start and ready_date<period_end), older as (select * from rows where ready_date<period_start), undated as (select * from rows where payout_ready_at is null)
  select jsonb_build_object(
   'today',private.wib_payout_date(),'period',p_period,'anchor_date',anchor_day,'period_start',period_start,'period_end',period_end,
   'ready_count',(select count(*) from selected),'ready_service',coalesce((select sum(vendor_fee_amount) from selected),0),'ready_shipping',coalesce((select sum(shipping_reimbursement) from selected),0),'ready_total',coalesce((select sum(vendor_fee_amount+shipping_reimbursement) from selected),0),
   'all_ready_count',(select count(*) from rows),'all_ready_total',coalesce((select sum(vendor_fee_amount+shipping_reimbursement) from rows),0),
   'older_count',(select count(*) from older),'older_total',coalesce((select sum(vendor_fee_amount+shipping_reimbursement) from older),0),
   'undated_count',(select count(*) from undated),'undated_total',coalesce((select sum(vendor_fee_amount+shipping_reimbursement) from undated),0),
   'review_count',(select count(*) from review),
   'ready_orders',coalesce((select jsonb_agg(jsonb_build_object('order_id',r.order_id,'order_number',r.order_number,'vendor_id',r.vendor_id,'vendor',r.vendor,'vendor_fee_amount',r.vendor_fee_amount,'shipping_reimbursement',r.shipping_reimbursement,'total_amount',r.vendor_fee_amount+r.shipping_reimbursement,'shipping_payer',r.shipping_payer,'original_shipping_amount',r.original_shipping_amount,'payout_ready_at',r.payout_ready_at,'ready_date',r.ready_date) order by r.vendor_id,r.payout_ready_at,r.order_id) from selected r),'[]'::jsonb),
   'older_orders',coalesce((select jsonb_agg(jsonb_build_object('order_id',r.order_id,'order_number',r.order_number,'vendor_id',r.vendor_id,'vendor',r.vendor,'vendor_fee_amount',r.vendor_fee_amount,'shipping_reimbursement',r.shipping_reimbursement,'total_amount',r.vendor_fee_amount+r.shipping_reimbursement,'shipping_payer',r.shipping_payer,'original_shipping_amount',r.original_shipping_amount,'payout_ready_at',r.payout_ready_at,'ready_date',r.ready_date) order by r.vendor_id,r.payout_ready_at,r.order_id) from older r),'[]'::jsonb),
   'undated_orders',coalesce((select jsonb_agg(jsonb_build_object('order_id',r.order_id,'order_number',r.order_number,'vendor_id',r.vendor_id,'vendor',r.vendor,'vendor_fee_amount',r.vendor_fee_amount,'shipping_reimbursement',r.shipping_reimbursement,'total_amount',r.vendor_fee_amount+r.shipping_reimbursement,'shipping_payer',r.shipping_payer,'original_shipping_amount',r.original_shipping_amount) order by r.vendor_id,r.order_id) from undated r),'[]'::jsonb),
   'review_orders',coalesce((select jsonb_agg(jsonb_build_object('order_id',r.order_id,'order_number',o.order_number,'vendor_id',r.vendor_id,'vendor',jsonb_build_object('name',p.full_name,'email',p.email),'vendor_fee_amount',r.vendor_fee_amount,'shipping_payer',r.shipping_payer,'review_reason',r.review_reason) order by r.vendor_id,r.order_id) from review r join public.orders o on o.id=r.order_id join public.profiles p on p.id=r.vendor_id),'[]'::jsonb),
   'payouts',coalesce((select jsonb_agg(private.payout_json(p.id) order by p.payout_date desc,p.created_at desc) from (select id,payout_date,created_at from public.vendor_payouts where p_vendor_id is null or vendor_id=p_vendor_id order by payout_date desc,created_at desc limit 25) p),'[]'::jsonb)
  )
 );
end $$;
revoke all on function private.vendor_payout_recap(uuid,text,date) from public,anon,authenticated;

create or replace function public.admin_vendor_payout_recap(p_period text default 'day',p_anchor_date date default null)
returns jsonb language plpgsql security definer set search_path='' as $$ begin perform private.require_admin(); return private.vendor_payout_recap(null,p_period,p_anchor_date); end $$;
revoke all on function public.admin_vendor_payout_recap(text,date) from public,anon;
grant execute on function public.admin_vendor_payout_recap(text,date) to authenticated;

create or replace function public.vendor_payout_recap(p_period text default 'day',p_anchor_date date default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
 if actor is null or not exists(select 1 from public.profiles where id=actor and role='vendor') then raise exception 'Vendor access required' using errcode='42501'; end if;
 return private.vendor_payout_recap(actor,p_period,p_anchor_date);
end $$;
revoke all on function public.vendor_payout_recap(text,date) from public,anon;
grant execute on function public.vendor_payout_recap(text,date) to authenticated;
