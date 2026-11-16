-- Finance workspace: one admin-only, server-aggregated read model.
-- Dates are supplied as WIB calendar dates and converted to timestamptz bounds here.
create or replace function private.admin_finance(
  p_period text default 'all',
  p_date date default null
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  local_today date := (clock_timestamp() at time zone 'Asia/Jakarta')::date;
  start_date date;
  end_date date;
  start_at timestamptz;
  end_at timestamptz;
  result jsonb;
begin
  perform private.require_admin();
  if p_period not in ('today','yesterday','month','all','custom') then
    raise exception 'Invalid finance period' using errcode='22023';
  end if;
  if p_period='today' then start_date:=local_today; end_date:=local_today+1;
  elsif p_period='yesterday' then start_date:=local_today-1; end_date:=local_today;
  elsif p_period='month' then start_date:=date_trunc('month',local_today)::date; end_date:=local_today+1;
  elsif p_period='custom' then
    if p_date is null then raise exception 'A date is required for custom period' using errcode='22023'; end if;
    start_date:=p_date; end_date:=p_date+1;
  end if;
  if p_period='all' then
    start_at:=null; end_at:=null;
  else
    start_at:=start_date::timestamp at time zone 'Asia/Jakarta';
    end_at:=end_date::timestamp at time zone 'Asia/Jakarta';
  end if;

  with
  bounds as (
    select start_at, end_at,
      case when p_period='all' then coalesce((select min((o.created_at at time zone 'Asia/Jakarta')::date) from public.orders o),local_today) else start_date end first_date,
      case when p_period='all' then local_today else end_date-1 end last_date
  ),
  order_rows as (
    select o.id,o.user_id,(o.created_at at time zone 'Asia/Jakarta')::date AS day,
      o.payment_status,o.subtotal,o.discount,o.shipping,o.grand_total
    from public.orders o,bounds b
    where (b.start_at is null or (o.created_at>=b.start_at and o.created_at<b.end_at))
  ),
  successful_payment_rows as (
    select distinct on (p.order_id) p.order_id,p.paid_at,p.amount,
      (p.paid_at at time zone 'Asia/Jakarta')::date AS day
    from public.payments p
    where p.status in ('paid','refunded') and p.paid_at is not null
      and (start_at is null or (p.paid_at>=start_at and p.paid_at<end_at))
    order by p.order_id,p.paid_at,p.id
  ),
  payment_rows as (
    select p.order_id,p.day,p.amount,o.subtotal,o.discount,o.shipping
    from successful_payment_rows p join public.orders o on o.id=p.order_id
  ),
  eligible_vendor_rows as (
    select a.order_id,a.vendor_fee_amount,
      case when s.shipping_payer='vendor' then s.actual_shipping_cost else 0 end shipping_reimbursement
    from public.order_vendor_assignments a
    join public.shipments s on s.order_id=a.order_id and s.vendor_id=a.vendor_id
    where s.status in ('shipped','delivered') and s.packing_status='packed'
      and s.actual_shipping_cost is not null and s.shipping_payer is not null
      and s.actual_shipping_entered_at is not null and s.actual_shipping_entered_by is not null
      and not exists(select 1 from public.vendor_payout_items i where i.order_id=a.order_id and i.status in ('reserved','paid'))
  ),
  draft_vendor_rows as (
    select i.id,i.vendor_fee_amount,i.shipping_reimbursement,i.total_amount
    from public.vendor_payout_items i join public.vendor_payouts p on p.id=i.payout_id
    where i.status='reserved' and p.status='draft'
  ),
  paid_vendor_rows as (
    select (p.paid_at at time zone 'Asia/Jakarta')::date AS day,
      i.vendor_fee_amount,i.shipping_reimbursement,i.total_amount
    from public.vendor_payout_items i join public.vendor_payouts p on p.id=i.payout_id
    where i.status='paid' and p.status='paid' and p.paid_at is not null
      and (start_at is null or (p.paid_at>=start_at and p.paid_at<end_at))
  ),
  days as (
    select generate_series(b.first_date,b.last_date,interval '1 day')::date AS day from bounds b
  ),
  daily as (
    select d.day,
      coalesce((select count(distinct o.user_id) from order_rows o where o.day=d.day),0) unique_customers,
      coalesce((select count(*) from order_rows o where o.day=d.day),0) orders,
      coalesce((select count(*) from order_rows o where o.day=d.day and o.payment_status='paid'),0) paid_orders,
      coalesce((select count(*) from order_rows o where o.day=d.day and o.payment_status not in ('paid','refunded')),0) unpaid_orders,
      coalesce((select count(*) from order_rows o where o.day=d.day and o.payment_status='refunded'),0) refunded_orders,
      coalesce((select sum(p.subtotal-p.discount) from payment_rows p where p.day=d.day),0) product_sales_after_discount,
      coalesce((select sum(p.shipping) from payment_rows p where p.day=d.day),0) customer_shipping,
      coalesce((select sum(p.amount) from payment_rows p where p.day=d.day),0) customer_payments,
      coalesce((select sum(v.vendor_fee_amount) from paid_vendor_rows v where v.day=d.day),0) vendor_service_paid,
      coalesce((select sum(v.shipping_reimbursement) from paid_vendor_rows v where v.day=d.day),0) vendor_shipping_paid,
      coalesce((select sum(v.total_amount) from paid_vendor_rows v where v.day=d.day),0) vendor_paid
    from days d order by d.day
  ),
  order_summary as (
    select count(distinct user_id) unique_customers,count(*) orders,
      count(*) filter(where payment_status='paid') paid_orders,
      count(*) filter(where payment_status not in ('paid','refunded')) unpaid_orders,
      count(*) filter(where payment_status='refunded') refunded_orders
    from order_rows
  ),
  payment_summary as (
    select coalesce(sum(subtotal-discount),0) product_sales_after_discount,
      coalesce(sum(shipping),0) customer_shipping,coalesce(sum(amount),0) customer_payments
    from payment_rows
  ),
  vendor_summary as (
    select coalesce((select sum(vendor_fee_amount) from eligible_vendor_rows),0) outstanding_service,
      coalesce((select sum(shipping_reimbursement) from eligible_vendor_rows),0) outstanding_shipping,
      coalesce((select sum(vendor_fee_amount) from draft_vendor_rows),0) draft_service,
      coalesce((select sum(shipping_reimbursement) from draft_vendor_rows),0) draft_shipping,
      coalesce((select sum(vendor_fee_amount) from draft_vendor_rows),0)+coalesce((select sum(shipping_reimbursement) from draft_vendor_rows),0) draft_total,
      coalesce((select sum(vendor_fee_amount) from eligible_vendor_rows),0)+coalesce((select sum(shipping_reimbursement) from eligible_vendor_rows),0) outstanding_total,
      coalesce((select sum(vendor_fee_amount) from paid_vendor_rows),0) paid_service,
      coalesce((select sum(shipping_reimbursement) from paid_vendor_rows),0) paid_shipping,
      coalesce((select sum(total_amount) from paid_vendor_rows),0) paid_total
  )
  select jsonb_build_object(
    'timezone','Asia/Jakarta','period',p_period,'date',p_date,
    'start_date',case when p_period='all' then null else start_date end,
    'end_date',case when p_period='all' then null else end_date-1 end,
    'orders',to_jsonb(os),'payments',to_jsonb(ps),'vendor',to_jsonb(vs),
    'daily',coalesce((select jsonb_agg(to_jsonb(d) order by d.day) from daily d),'[]'::jsonb),
    'limitations',jsonb_build_object(
      'refunds','Nominal dan tanggal refund belum tercatat terpisah.',
      'payment_fees','Biaya payment gateway belum tercatat sebagai kolom/agregat.',
      'vendor_new_billings','Belum tersedia: tanggal saat order memenuhi syarat tagihan belum dapat ditentukan dengan andal.'
    )
  ) into result
  from order_summary os cross join payment_summary ps cross join vendor_summary vs;
  return result;
end $$;

revoke all on function private.admin_finance(text,date) from public,anon,authenticated;
create or replace function public.admin_finance(p_period text default 'all',p_date date default null)
returns jsonb language sql security definer set search_path='' as $$ select private.admin_finance(p_period,p_date); $$;
revoke all on function public.admin_finance(text,date) from public,anon;
grant execute on function public.admin_finance(text,date) to authenticated;
