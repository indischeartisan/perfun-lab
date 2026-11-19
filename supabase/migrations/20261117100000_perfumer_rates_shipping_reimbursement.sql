-- Admin-managed perfumer rates and immutable RajaOngkir reimbursement snapshots.
-- Checkout and customer voucher totals are intentionally not changed here.

create table private.vendor_fee_settings (
 singleton boolean primary key default true check(singleton),
 service_10ml bigint not null default 50000 check(service_10ml > 0),
 service_30ml bigint not null default 100000 check(service_30ml > 0),
 updated_by uuid references public.profiles(id),
 updated_at timestamptz not null default clock_timestamp()
);
alter table private.vendor_fee_settings enable row level security;
revoke all on private.vendor_fee_settings from public,anon,authenticated;
grant all on private.vendor_fee_settings to service_role;
insert into private.vendor_fee_settings(singleton,service_10ml,service_30ml)
values(true,50000,100000)
on conflict(singleton) do nothing;

create or replace function private.vendor_fee_settings_json()
returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object(
   'service_10ml',s.service_10ml,
   'service_30ml',s.service_30ml,
   'play_set',s.service_10ml*3,
   'updated_at',s.updated_at
 )
 from private.vendor_fee_settings s where s.singleton=true;
$$;
revoke all on function private.vendor_fee_settings_json() from public,anon,authenticated;

create or replace function private.admin_vendor_fee_settings()
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.require_admin();
 return private.vendor_fee_settings_json();
end $$;
revoke all on function private.admin_vendor_fee_settings() from public,anon,authenticated;
create or replace function public.admin_vendor_fee_settings()
returns jsonb language sql security definer set search_path='' as $$ select private.admin_vendor_fee_settings(); $$;
revoke all on function public.admin_vendor_fee_settings() from public,anon;
grant execute on function public.admin_vendor_fee_settings() to authenticated;

create or replace function private.admin_update_vendor_fee_settings(p_service_10ml bigint,p_service_30ml bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.require_admin();
 if p_service_10ml is null or p_service_30ml is null or p_service_10ml<=0 or p_service_30ml<=0
    or p_service_10ml>100000000 or p_service_30ml>100000000 then
   raise exception 'Tarif jasa tidak valid' using errcode='22023';
 end if;
 update private.vendor_fee_settings
 set service_10ml=p_service_10ml,service_30ml=p_service_30ml,updated_by=auth.uid(),updated_at=clock_timestamp()
 where singleton=true;
 return private.vendor_fee_settings_json();
end $$;
revoke all on function private.admin_update_vendor_fee_settings(bigint,bigint) from public,anon,authenticated;
create or replace function public.admin_update_vendor_fee_settings(p_service_10ml bigint,p_service_30ml bigint)
returns jsonb language sql security definer set search_path='' as $$ select private.admin_update_vendor_fee_settings(p_service_10ml,p_service_30ml); $$;
revoke all on function public.admin_update_vendor_fee_settings(bigint,bigint) from public,anon;
grant execute on function public.admin_update_vendor_fee_settings(bigint,bigint) to authenticated;

-- This is the only source used for new perfumer assignments. Existing rows keep
-- their vendor_fee_amount/vendor_fee_snapshot values forever.
create or replace function private.vendor_fee_snapshot(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare item public.order_items; rates private.vendor_fee_settings; product_id text; unit_fee bigint; line_fee bigint;
 lines jsonb:='[]'::jsonb; total bigint:=0;
begin
 select * into rates from private.vendor_fee_settings where singleton=true for share;
 if not found then raise exception 'Vendor fee settings are missing' using errcode='23514'; end if;
 for item in select * from public.order_items where order_id=p_order_id order by position loop
  product_id:=item.product_snapshot->>'id';
  unit_fee:=case product_id
    when '10ml' then rates.service_10ml
    when '30ml' then rates.service_30ml
    when 'bundle-3x10ml' then rates.service_10ml*3
    else null
  end;
  if unit_fee is null then raise exception 'Unsupported product snapshot for vendor fee' using errcode='23514'; end if;
  line_fee:=unit_fee*item.quantity;
  total:=total+line_fee;
  lines:=lines||jsonb_build_array(jsonb_build_object('position',item.position,'product_id',product_id,
   'quantity',item.quantity,'unit_fee',unit_fee,'line_fee',line_fee));
 end loop;
 if total=0 then raise exception 'Order has no vendor-fee items' using errcode='23514'; end if;
 return jsonb_build_object('policy_version',2,'currency','IDR',
   'rates',jsonb_build_object('service_10ml',rates.service_10ml,'service_30ml',rates.service_30ml,'play_set',rates.service_10ml*3),
   'lines',lines,'total_fee',total);
end $$;
revoke all on function private.vendor_fee_snapshot(uuid) from public,anon,authenticated;

-- Only the checkout snapshot is trusted. A missing/invalid historical value is
-- NULL and must be reviewed; amount/customer_shipping_total are never fallbacks.
create or replace function private.original_shipping_rate(p_order_id uuid)
returns bigint language sql stable security definer set search_path='' as $$
 select case
   when o.shipping_quote_snapshot->>'original_shipping_amount' ~ '^[0-9]+$'
    and (o.shipping_quote_snapshot->>'original_shipping_amount')::bigint > 0
   then (o.shipping_quote_snapshot->>'original_shipping_amount')::bigint
   else null
 end
 from public.orders o where o.id=p_order_id;
$$;
revoke all on function private.original_shipping_rate(uuid) from public,anon,authenticated;

create or replace function private.admin_create_vendor_payout(p_vendor_id uuid,p_request_id uuid,p_payout_date date default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); vendor_role public.app_role; target_date date:=coalesce(p_payout_date,private.wib_payout_date()); payout public.vendor_payouts; candidate record; total_amount bigint:=0;
begin
 perform private.require_admin();
 if p_vendor_id is null or p_request_id is null then raise exception 'Vendor and request ID are required' using errcode='22023'; end if;
 if target_date>private.wib_payout_date() then raise exception 'Payout date cannot be in the future (WIB)' using errcode='23514'; end if;
 select role into vendor_role from public.profiles where id=p_vendor_id for share;
 if vendor_role is distinct from 'vendor' then raise exception 'Payout target must be an active vendor' using errcode='23514'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_vendor_id::text,0));
 select * into payout from public.vendor_payouts where vendor_id=p_vendor_id and request_id=p_request_id for update;
 if found then return private.payout_json(payout.id); end if;
 insert into public.vendor_payouts(vendor_id,payout_date,request_id) values(p_vendor_id,target_date,p_request_id) returning * into payout;
 for candidate in
  select a.order_id,a.vendor_fee_amount,s.shipping_payer,private.original_shipping_rate(o.id) original_shipping_amount
  from public.order_vendor_assignments a
  join public.shipments s on s.order_id=a.order_id
  join public.orders o on o.id=a.order_id
  where a.vendor_id=p_vendor_id and s.vendor_id=p_vendor_id and s.status in ('shipped','delivered')
   and s.packing_status='packed'
   and (s.shipping_payer<>'vendor' or private.original_shipping_rate(o.id) is not null)
   and not exists(select 1 from public.vendor_payout_items existing where existing.order_id=a.order_id and existing.status in ('reserved','paid'))
  for update of a,s
 loop
  insert into public.vendor_payout_items(payout_id,order_id,vendor_id,vendor_fee_amount,shipping_reimbursement,total_amount)
  values(payout.id,candidate.order_id,p_vendor_id,candidate.vendor_fee_amount,
   case when candidate.shipping_payer='vendor' then candidate.original_shipping_amount else 0 end,
   candidate.vendor_fee_amount+case when candidate.shipping_payer='vendor' then candidate.original_shipping_amount else 0 end);
  total_amount:=total_amount+candidate.vendor_fee_amount+case when candidate.shipping_payer='vendor' then candidate.original_shipping_amount else 0 end;
 end loop;
 if total_amount=0 then raise exception 'Tidak ada pesanan yang dapat dibayar; periksa pesanan bertanda Perlu ditinjau' using errcode='23514'; end if;
 update public.vendor_payouts set total=total_amount where id=payout.id;
 return private.payout_json(payout.id);
end $$;
revoke all on function private.admin_create_vendor_payout(uuid,uuid,date) from public,anon,authenticated;
create or replace function public.admin_create_vendor_payout(p_vendor_id uuid,p_request_id uuid,p_payout_date date default null)
returns jsonb language sql security definer set search_path='' as $$ select private.admin_create_vendor_payout(p_vendor_id,p_request_id,p_payout_date); $$;
revoke all on function public.admin_create_vendor_payout(uuid,uuid,date) from public,anon;
grant execute on function public.admin_create_vendor_payout(uuid,uuid,date) to authenticated;

create or replace function private.admin_vendor_payout_workspace(p_page integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.require_admin();
 if p_page is null or p_page not between 0 and 100000 then raise exception 'Invalid page' using errcode='22023'; end if;
 return jsonb_build_object(
  'today',private.wib_payout_date(),
  'outstanding_total',(select coalesce(sum(a.vendor_fee_amount+case when s.shipping_payer='vendor' then private.original_shipping_rate(o.id) else 0 end),0) from public.order_vendor_assignments a join public.shipments s on s.order_id=a.order_id join public.orders o on o.id=a.order_id where s.vendor_id=a.vendor_id and s.status in ('shipped','delivered') and s.packing_status='packed' and (s.shipping_payer<>'vendor' or private.original_shipping_rate(o.id) is not null) and not exists(select 1 from public.vendor_payout_items i where i.order_id=a.order_id and i.status in ('reserved','paid'))),
  'eligible_count',(select count(*) from public.order_vendor_assignments a join public.shipments s on s.order_id=a.order_id join public.orders o on o.id=a.order_id where s.vendor_id=a.vendor_id and s.status in ('shipped','delivered') and s.packing_status='packed' and (s.shipping_payer<>'vendor' or private.original_shipping_rate(o.id) is not null) and not exists(select 1 from public.vendor_payout_items i where i.order_id=a.order_id and i.status in ('reserved','paid'))),
  'review_count',(select count(*) from public.order_vendor_assignments a join public.shipments s on s.order_id=a.order_id join public.orders o on o.id=a.order_id where s.vendor_id=a.vendor_id and s.status in ('shipped','delivered') and s.packing_status='packed' and s.shipping_payer='vendor' and private.original_shipping_rate(o.id) is null and not exists(select 1 from public.vendor_payout_items i where i.order_id=a.order_id and i.status in ('reserved','paid'))),
  'eligible_orders',(select coalesce(jsonb_agg(to_jsonb(row) order by row.shipped_at,row.order_id),'[]'::jsonb) from (select a.order_id,o.order_number,a.vendor_id,jsonb_build_object('name',p.full_name,'email',p.email) vendor,a.vendor_fee_amount,case when s.shipping_payer='vendor' then private.original_shipping_rate(o.id) else 0 end shipping_reimbursement,a.vendor_fee_amount+case when s.shipping_payer='vendor' then private.original_shipping_rate(o.id) else 0 end total_amount,s.shipping_payer,private.original_shipping_rate(o.id) original_shipping_amount,s.shipped_at from public.order_vendor_assignments a join public.shipments s on s.order_id=a.order_id join public.orders o on o.id=a.order_id join public.profiles p on p.id=a.vendor_id where s.vendor_id=a.vendor_id and s.status in ('shipped','delivered') and s.packing_status='packed' and (s.shipping_payer<>'vendor' or private.original_shipping_rate(o.id) is not null) and not exists(select 1 from public.vendor_payout_items i where i.order_id=a.order_id and i.status in ('reserved','paid')) order by s.shipped_at,a.order_id limit 25 offset p_page*25) row),
  'review_orders',(select coalesce(jsonb_agg(to_jsonb(row) order by row.shipped_at,row.order_id),'[]'::jsonb) from (select a.order_id,o.order_number,a.vendor_id,jsonb_build_object('name',p.full_name,'email',p.email) vendor,a.vendor_fee_amount,s.shipping_payer,s.shipped_at,'Tarif RajaOngkir sebelum voucher tidak tersimpan' review_reason from public.order_vendor_assignments a join public.shipments s on s.order_id=a.order_id join public.orders o on o.id=a.order_id join public.profiles p on p.id=a.vendor_id where s.vendor_id=a.vendor_id and s.status in ('shipped','delivered') and s.packing_status='packed' and s.shipping_payer='vendor' and private.original_shipping_rate(o.id) is null and not exists(select 1 from public.vendor_payout_items i where i.order_id=a.order_id and i.status in ('reserved','paid')) order by s.shipped_at,a.order_id limit 25 offset p_page*25) row),
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
  'earned_today',(select coalesce(sum(a.vendor_fee_amount+case when s.shipping_payer='vendor' then private.original_shipping_rate(o.id) else 0 end),0) from public.order_vendor_assignments a join public.shipments s on s.order_id=a.order_id join public.orders o on o.id=a.order_id where a.vendor_id=actor and s.vendor_id=actor and s.status in ('shipped','delivered') and s.packing_status='packed' and (s.shipping_payer<>'vendor' or private.original_shipping_rate(o.id) is not null) and private.wib_payout_date(s.shipped_at)=private.wib_payout_date()),
  'unpaid_total',(select coalesce(sum(i.total_amount),0) from public.vendor_payout_items i join public.vendor_payouts p on p.id=i.payout_id where i.vendor_id=actor and i.status='reserved' and p.status='draft') + (select coalesce(sum(a.vendor_fee_amount+case when s.shipping_payer='vendor' then private.original_shipping_rate(o.id) else 0 end),0) from public.order_vendor_assignments a join public.shipments s on s.order_id=a.order_id join public.orders o on o.id=a.order_id where a.vendor_id=actor and s.vendor_id=actor and s.status in ('shipped','delivered') and s.packing_status='packed' and (s.shipping_payer<>'vendor' or private.original_shipping_rate(o.id) is not null) and not exists(select 1 from public.vendor_payout_items i where i.order_id=a.order_id and i.status in ('reserved','paid'))),
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

-- Keep the Finance read model on the same original-rate source as payouts.
create or replace function private.admin_finance(p_period text default 'all',p_date date default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare local_today date:=(clock_timestamp() at time zone 'Asia/Jakarta')::date; start_date date; end_date date; start_at timestamptz; end_at timestamptz; result jsonb;
begin
 perform private.require_admin();
 if p_period not in ('today','yesterday','month','all','custom') then raise exception 'Invalid finance period' using errcode='22023'; end if;
 if p_period='today' then start_date:=local_today; end_date:=local_today+1;
 elsif p_period='yesterday' then start_date:=local_today-1; end_date:=local_today;
 elsif p_period='month' then start_date:=date_trunc('month',local_today)::date; end_date:=local_today+1;
 elsif p_period='custom' then if p_date is null then raise exception 'A date is required for custom period' using errcode='22023'; end if; start_date:=p_date; end_date:=p_date+1; end if;
 if p_period='all' then start_at:=null; end_at:=null; else start_at:=start_date::timestamp at time zone 'Asia/Jakarta'; end_at:=end_date::timestamp at time zone 'Asia/Jakarta'; end if;
 with bounds as (select start_at,end_at,case when p_period='all' then coalesce((select min((o.created_at at time zone 'Asia/Jakarta')::date) from public.orders o),local_today) else start_date end first_date,case when p_period='all' then local_today else end_date-1 end last_date),
 order_rows as (select o.id,o.user_id,(o.created_at at time zone 'Asia/Jakarta')::date AS day,o.payment_status,o.subtotal,o.discount,o.shipping from public.orders o,bounds b where (b.start_at is null or (o.created_at>=b.start_at and o.created_at<b.end_at))),
 successful_payment_rows as (select distinct on (p.order_id) p.order_id,p.paid_at,p.amount,(p.paid_at at time zone 'Asia/Jakarta')::date AS day from public.payments p where p.status in ('paid','refunded') and p.paid_at is not null and (start_at is null or (p.paid_at>=start_at and p.paid_at<end_at)) order by p.order_id,p.paid_at,p.id),
 payment_rows as (select p.order_id,p.day,p.amount,o.subtotal,o.discount,o.shipping from successful_payment_rows p join public.orders o on o.id=p.order_id),
 eligible_vendor_rows as (select a.order_id,a.vendor_fee_amount,case when s.shipping_payer='vendor' then private.original_shipping_rate(o.id) else 0 end shipping_reimbursement from public.order_vendor_assignments a join public.shipments s on s.order_id=a.order_id and s.vendor_id=a.vendor_id join public.orders o on o.id=a.order_id where s.status in ('shipped','delivered') and s.packing_status='packed' and s.shipping_payer is not null and (s.shipping_payer<>'vendor' or private.original_shipping_rate(o.id) is not null) and not exists(select 1 from public.vendor_payout_items i where i.order_id=a.order_id and i.status in ('reserved','paid'))),
 draft_vendor_rows as (select i.vendor_fee_amount,i.shipping_reimbursement,i.total_amount from public.vendor_payout_items i join public.vendor_payouts p on p.id=i.payout_id where i.status='reserved' and p.status='draft'),
 paid_vendor_rows as (select (p.paid_at at time zone 'Asia/Jakarta')::date AS day,i.vendor_fee_amount,i.shipping_reimbursement,i.total_amount from public.vendor_payout_items i join public.vendor_payouts p on p.id=i.payout_id where i.status='paid' and p.status='paid' and p.paid_at is not null and (start_at is null or (p.paid_at>=start_at and p.paid_at<end_at))),
 days as (select generate_series(b.first_date,b.last_date,interval '1 day')::date AS day from bounds b),
 daily as (select d.day,coalesce((select count(distinct o.user_id) from order_rows o where o.day=d.day),0) unique_customers,coalesce((select count(*) from order_rows o where o.day=d.day),0) orders,coalesce((select count(*) from order_rows o where o.day=d.day and o.payment_status='paid'),0) paid_orders,coalesce((select count(*) from order_rows o where o.day=d.day and o.payment_status not in ('paid','refunded')),0) unpaid_orders,coalesce((select count(*) from order_rows o where o.day=d.day and o.payment_status='refunded'),0) refunded_orders,coalesce((select sum(p.subtotal-p.discount) from payment_rows p where p.day=d.day),0) product_sales_after_discount,coalesce((select sum(p.shipping) from payment_rows p where p.day=d.day),0) customer_shipping,coalesce((select sum(p.amount) from payment_rows p where p.day=d.day),0) customer_payments,coalesce((select sum(v.vendor_fee_amount) from paid_vendor_rows v where v.day=d.day),0) vendor_service_paid,coalesce((select sum(v.shipping_reimbursement) from paid_vendor_rows v where v.day=d.day),0) vendor_shipping_paid,coalesce((select sum(v.total_amount) from paid_vendor_rows v where v.day=d.day),0) vendor_paid from days d order by d.day),
 order_summary as (select count(distinct user_id) unique_customers,count(*) orders,count(*) filter(where payment_status='paid') paid_orders,count(*) filter(where payment_status not in ('paid','refunded')) unpaid_orders,count(*) filter(where payment_status='refunded') refunded_orders from order_rows),
 payment_summary as (select coalesce(sum(subtotal-discount),0) product_sales_after_discount,coalesce(sum(shipping),0) customer_shipping,coalesce(sum(amount),0) customer_payments from payment_rows),
 vendor_summary as (select coalesce((select sum(vendor_fee_amount) from eligible_vendor_rows),0) outstanding_service,coalesce((select sum(shipping_reimbursement) from eligible_vendor_rows),0) outstanding_shipping,coalesce((select sum(vendor_fee_amount) from draft_vendor_rows),0) draft_service,coalesce((select sum(shipping_reimbursement) from draft_vendor_rows),0) draft_shipping,coalesce((select sum(vendor_fee_amount+shipping_reimbursement) from draft_vendor_rows),0) draft_total,coalesce((select sum(vendor_fee_amount+shipping_reimbursement) from eligible_vendor_rows),0) outstanding_total,coalesce((select sum(vendor_fee_amount) from paid_vendor_rows),0) paid_service,coalesce((select sum(shipping_reimbursement) from paid_vendor_rows),0) paid_shipping,coalesce((select sum(total_amount) from paid_vendor_rows),0) paid_total)
 select jsonb_build_object('timezone','Asia/Jakarta','period',p_period,'date',p_date,'start_date',case when p_period='all' then null else start_date end,'end_date',case when p_period='all' then null else end_date-1 end,'orders',to_jsonb(os),'payments',to_jsonb(ps),'vendor',to_jsonb(vs),'daily',coalesce((select jsonb_agg(to_jsonb(d) order by d.day) from daily d),'[]'::jsonb),'limitations',jsonb_build_object('refunds','Nominal dan tanggal refund belum tercatat terpisah.','payment_fees','Biaya payment gateway belum tercatat sebagai kolom/agregat.','vendor_new_billings','Belum tersedia: tanggal saat order memenuhi syarat tagihan belum dapat ditentukan dengan andal.')) into result from order_summary os cross join payment_summary ps cross join vendor_summary vs;
 return result;
end $$;
revoke all on function private.admin_finance(text,date) from public,anon,authenticated;
create or replace function public.admin_finance(p_period text default 'all',p_date date default null) returns jsonb language sql security definer set search_path='' as $$ select private.admin_finance(p_period,p_date); $$;
revoke all on function public.admin_finance(text,date) from public,anon;
grant execute on function public.admin_finance(text,date) to authenticated;
