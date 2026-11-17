-- Keep the Finance ready-to-transfer summary, payout workspace, and draft
-- creation on one eligibility rule. Historical rows with an unknown payer or
-- missing original RajaOngkir rate stay out of drafts and are review-only.

create or replace function private.admin_vendor_payout_workspace(p_page integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.require_admin();
 if p_page is null or p_page not between 0 and 100000 then raise exception 'Invalid page' using errcode='22023'; end if;
 return (
  with eligible as (
   select a.order_id,a.vendor_id,a.vendor_fee_amount,s.shipping_payer::text shipping_payer,
    case when s.shipping_payer='vendor' then private.original_shipping_rate(o.id) else 0 end shipping_reimbursement,
    private.original_shipping_rate(o.id) original_shipping_amount,s.shipped_at
   from public.order_vendor_assignments a
   join public.shipments s on s.order_id=a.order_id and s.vendor_id=a.vendor_id
   join public.orders o on o.id=a.order_id
   where o.payment_status='paid' and s.status in ('shipped','delivered') and s.packing_status='packed'
    and s.actual_shipping_cost is not null and s.shipping_payer is not null
    and (s.shipping_payer<>'vendor' or private.original_shipping_rate(o.id) is not null)
    and not exists(select 1 from public.vendor_payout_items i where i.order_id=a.order_id and i.status in ('reserved','paid'))
  ), review as (
   select a.order_id,a.vendor_id,a.vendor_fee_amount,s.shipping_payer::text shipping_payer,s.shipped_at,
    case when s.shipping_payer is null then 'Pembayar ongkir belum tercatat'
      when s.actual_shipping_cost is null then 'Ongkir aktual belum tercatat'
      else 'Tarif RajaOngkir sebelum voucher tidak tersimpan' end review_reason
   from public.order_vendor_assignments a
   join public.shipments s on s.order_id=a.order_id and s.vendor_id=a.vendor_id
   join public.orders o on o.id=a.order_id
   where o.payment_status='paid' and s.status in ('shipped','delivered') and s.packing_status='packed'
    and (s.shipping_payer is null or s.actual_shipping_cost is null or (s.shipping_payer='vendor' and private.original_shipping_rate(o.id) is null))
    and not exists(select 1 from public.vendor_payout_items i where i.order_id=a.order_id and i.status in ('reserved','paid'))
  )
  select jsonb_build_object(
   'today',private.wib_payout_date(),
   'outstanding_service',coalesce((select sum(vendor_fee_amount) from eligible),0),
   'outstanding_shipping',coalesce((select sum(shipping_reimbursement) from eligible),0),
   'outstanding_total',coalesce((select sum(vendor_fee_amount+shipping_reimbursement) from eligible),0),
   'eligible_count',(select count(*) from eligible),
   'review_count',(select count(*) from review),
   'eligible_orders',coalesce((select jsonb_agg(jsonb_build_object('order_id',e.order_id,'order_number',o.order_number,'vendor_id',e.vendor_id,'vendor',jsonb_build_object('name',p.full_name,'email',p.email),'vendor_fee_amount',e.vendor_fee_amount,'shipping_reimbursement',e.shipping_reimbursement,'total_amount',e.vendor_fee_amount+e.shipping_reimbursement,'shipping_payer',e.shipping_payer,'original_shipping_amount',e.original_shipping_amount,'shipped_at',e.shipped_at) order by e.shipped_at,e.order_id) from (select * from eligible order by shipped_at,order_id limit 25 offset p_page*25) e join public.orders o on o.id=e.order_id join public.profiles p on p.id=e.vendor_id),'[]'::jsonb),
   'review_orders',coalesce((select jsonb_agg(jsonb_build_object('order_id',r.order_id,'order_number',o.order_number,'vendor_id',r.vendor_id,'vendor',jsonb_build_object('name',p.full_name,'email',p.email),'vendor_fee_amount',r.vendor_fee_amount,'shipping_payer',r.shipping_payer,'review_reason',r.review_reason,'shipped_at',r.shipped_at) order by r.shipped_at,r.order_id) from (select * from review order by shipped_at,order_id limit 25 offset p_page*25) r join public.orders o on o.id=r.order_id join public.profiles p on p.id=r.vendor_id),'[]'::jsonb),
   'payouts',coalesce((select jsonb_agg(private.payout_json(p.id) order by p.payout_date desc,p.created_at desc) from (select id,payout_date,created_at from public.vendor_payouts order by payout_date desc,created_at desc limit 25 offset p_page*25) p),'[]'::jsonb),
   'payout_count',(select count(*) from public.vendor_payouts)
  )
 );
end $$;

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
  from public.order_vendor_assignments a join public.shipments s on s.order_id=a.order_id and s.vendor_id=a.vendor_id join public.orders o on o.id=a.order_id
  where a.vendor_id=p_vendor_id and o.payment_status='paid' and s.status in ('shipped','delivered') and s.packing_status='packed'
   and s.actual_shipping_cost is not null and s.shipping_payer is not null
   and (s.shipping_payer<>'vendor' or private.original_shipping_rate(o.id) is not null)
   and not exists(select 1 from public.vendor_payout_items existing where existing.order_id=a.order_id and existing.status in ('reserved','paid'))
  for update of a,s
 loop
  insert into public.vendor_payout_items(payout_id,order_id,vendor_id,vendor_fee_amount,shipping_reimbursement,total_amount)
  values(payout.id,candidate.order_id,p_vendor_id,candidate.vendor_fee_amount,case when candidate.shipping_payer='vendor' then candidate.original_shipping_amount else 0 end,candidate.vendor_fee_amount+case when candidate.shipping_payer='vendor' then candidate.original_shipping_amount else 0 end);
  total_amount:=total_amount+candidate.vendor_fee_amount+case when candidate.shipping_payer='vendor' then candidate.original_shipping_amount else 0 end;
 end loop;
 if total_amount=0 then raise exception 'Tidak ada pesanan yang dapat dibayar; periksa pesanan bertanda Perlu ditinjau' using errcode='23514'; end if;
 update public.vendor_payouts set total=total_amount where id=payout.id;
 return private.payout_json(payout.id);
end $$;
