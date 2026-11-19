-- Expose the immutable public order reference in existing perfumer-payout
-- projections. The source remains public.orders; payout amounts, eligibility,
-- access checks, and internal identifiers are intentionally unchanged.

create or replace function private.payout_json(p_payout_id uuid)
returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object(
  'id',p.id,'vendor_id',p.vendor_id,'vendor',jsonb_build_object('name',v.full_name,'email',v.email),'payout_date',p.payout_date,'status',p.status,'total',p.total,
  'transfer_reference',p.transfer_reference,'paid_at',p.paid_at,'paid_by',p.paid_by,'request_id',p.request_id,
  'void_reason',p.void_reason,'voided_at',p.voided_at,'voided_by',p.voided_by,'created_at',p.created_at,
  'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'order_id',i.order_id,'order_number',o.order_number,'public_order_number',o.public_order_number,
   'vendor_fee_amount',i.vendor_fee_amount,'shipping_reimbursement',i.shipping_reimbursement,'total_amount',i.total_amount,'status',i.status) order by o.created_at,o.id)
   from public.vendor_payout_items i join public.orders o on o.id=i.order_id where i.payout_id=p.id),'[]'::jsonb)
 ) from public.vendor_payouts p join public.profiles v on v.id=p.vendor_id where p.id=p_payout_id;
$$;
revoke all on function private.payout_json(uuid) from public,anon,authenticated;

create or replace function private.vendor_payout_recap(p_vendor_id uuid,p_period text default 'day',p_anchor_date date default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare anchor_day date:=coalesce(p_anchor_date,private.wib_payout_date()); period_start date; period_end date;
begin
 if p_period not in ('day','week','month') then raise exception 'Invalid payout recap period' using errcode='22023'; end if;
 period_start:=case p_period when 'day' then anchor_day when 'week' then date_trunc('week',anchor_day)::date else date_trunc('month',anchor_day)::date end;
 period_end:=case p_period when 'day' then period_start+1 when 'week' then period_start+7 else (period_start+interval '1 month')::date end;
 return (
  with paid_orders as (
   select p.order_id,min(p.paid_at) paid_at
   from public.payments p
   where p.status='paid' and p.paid_at is not null
   group by p.order_id
  ), rows as (
   select a.order_id,a.vendor_id,a.vendor_fee_amount,paid.paid_at,
    (paid.paid_at at time zone 'Asia/Jakarta')::date payment_date,
    private.original_shipping_rate(o.id) shipping_reimbursement,
    o.order_number,o.public_order_number,jsonb_build_object('name',v.full_name,'email',v.email) vendor,item_products.products
   from paid_orders paid
   join public.orders o on o.id=paid.order_id
   join public.order_vendor_assignments a on a.order_id=o.id
   join public.profiles v on v.id=a.vendor_id
   cross join lateral (
    select coalesce(jsonb_agg(jsonb_build_object(
     'label',i.product_snapshot->>'label','volume_ml',i.product_snapshot->'volume_ml',
     'bottle_count',i.product_snapshot->'bottle_count','quantity',i.quantity
    ) order by i.position),'[]'::jsonb) products
    from public.order_items i where i.order_id=o.id
   ) item_products
   where (p_vendor_id is null or a.vendor_id=p_vendor_id)
    and not exists(select 1 from public.vendor_payout_items i where i.order_id=a.order_id and i.status in ('reserved','paid'))
  ), selected as (
   select * from rows where payment_date>=period_start and payment_date<period_end
  ), older as (
   select * from rows where payment_date<period_start
  ), shipping_missing as (
   select * from selected where shipping_reimbursement is null
  ), unassigned as (
   select paid.order_id,o.order_number,o.public_order_number,paid.paid_at,(paid.paid_at at time zone 'Asia/Jakarta')::date payment_date,item_products.products
   from paid_orders paid
   join public.orders o on o.id=paid.order_id
   cross join lateral (
    select coalesce(jsonb_agg(jsonb_build_object(
     'label',i.product_snapshot->>'label','volume_ml',i.product_snapshot->'volume_ml',
     'bottle_count',i.product_snapshot->'bottle_count','quantity',i.quantity
    ) order by i.position),'[]'::jsonb) products
    from public.order_items i where i.order_id=o.id
   ) item_products
   where p_vendor_id is null
    and (paid.paid_at at time zone 'Asia/Jakarta')::date>=period_start
    and (paid.paid_at at time zone 'Asia/Jakarta')::date<period_end
    and not exists(select 1 from public.order_vendor_assignments a where a.order_id=o.id)
    and not exists(select 1 from public.vendor_payout_items i where i.order_id=o.id and i.status in ('reserved','paid'))
  )
  select jsonb_build_object(
   'today',private.wib_payout_date(),'period',p_period,'anchor_date',anchor_day,'period_start',period_start,'period_end',period_end,
   'paid_count',(select count(*) from selected),'paid_service',coalesce((select sum(vendor_fee_amount) from selected),0),'paid_shipping',coalesce((select sum(shipping_reimbursement) from selected),0),'paid_total',coalesce((select sum(vendor_fee_amount+coalesce(shipping_reimbursement,0)) from selected),0),'shipping_missing_count',(select count(*) from shipping_missing),
   'all_paid_count',(select count(*) from rows),'all_paid_total',coalesce((select sum(vendor_fee_amount+coalesce(shipping_reimbursement,0)) from rows),0),'all_shipping_missing_count',(select count(*) from rows where shipping_reimbursement is null),
   'older_count',(select count(*) from older),'older_total',coalesce((select sum(vendor_fee_amount+coalesce(shipping_reimbursement,0)) from older),0),
   'unassigned_count',(select count(*) from unassigned),
   'paid_orders',coalesce((select jsonb_agg(jsonb_build_object('order_id',r.order_id,'order_number',r.order_number,'public_order_number',r.public_order_number,'vendor_id',r.vendor_id,'vendor',r.vendor,'products',r.products,'vendor_fee_amount',r.vendor_fee_amount,'shipping_reimbursement',r.shipping_reimbursement,'total_amount',case when r.shipping_reimbursement is null then null else r.vendor_fee_amount+r.shipping_reimbursement end,'original_shipping_amount',r.shipping_reimbursement,'payment_paid_at',r.paid_at,'payment_date',r.payment_date) order by r.vendor_id,r.paid_at,r.order_id) from selected r),'[]'::jsonb),
   'older_orders',coalesce((select jsonb_agg(jsonb_build_object('order_id',r.order_id,'order_number',r.order_number,'public_order_number',r.public_order_number,'vendor_id',r.vendor_id,'vendor',r.vendor,'products',r.products,'vendor_fee_amount',r.vendor_fee_amount,'shipping_reimbursement',r.shipping_reimbursement,'total_amount',case when r.shipping_reimbursement is null then null else r.vendor_fee_amount+r.shipping_reimbursement end,'original_shipping_amount',r.shipping_reimbursement,'payment_paid_at',r.paid_at,'payment_date',r.payment_date) order by r.vendor_id,r.paid_at,r.order_id) from older r),'[]'::jsonb),
   'shipping_missing_orders',coalesce((select jsonb_agg(jsonb_build_object('order_id',r.order_id,'order_number',r.order_number,'public_order_number',r.public_order_number,'vendor_id',r.vendor_id,'vendor',r.vendor,'products',r.products,'vendor_fee_amount',r.vendor_fee_amount,'review_reason','Ongkir belum tercatat','payment_paid_at',r.paid_at,'payment_date',r.payment_date) order by r.vendor_id,r.paid_at,r.order_id) from shipping_missing r),'[]'::jsonb),
   'unassigned_orders',coalesce((select jsonb_agg(jsonb_build_object('order_id',u.order_id,'order_number',u.order_number,'public_order_number',u.public_order_number,'products',u.products,'review_reason','Belum ditugaskan','payment_paid_at',u.paid_at,'payment_date',u.payment_date) order by u.paid_at,u.order_id) from unassigned u),'[]'::jsonb),
   'payouts',coalesce((select jsonb_agg(private.payout_json(p.id) order by p.payout_date desc,p.created_at desc) from (select id,payout_date,created_at from public.vendor_payouts where p_vendor_id is null or vendor_id=p_vendor_id order by payout_date desc,created_at desc limit 25) p),'[]'::jsonb)
  )
 );
end $$;
revoke all on function private.vendor_payout_recap(uuid,text,date) from public,anon,authenticated;
