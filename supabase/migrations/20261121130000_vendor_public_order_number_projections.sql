-- Keep operational lookup keys internal while exposing the immutable public
-- order reference in the existing Vendor and Admin read models.

create or replace function private.list_fulfillment_shipments(p_status text,p_page integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); actor_role public.app_role;
begin
 select role into actor_role from public.profiles where id=actor;
 if actor is null or actor_role not in ('vendor','admin') then raise exception 'Vendor or admin access required' using errcode='42501'; end if;
 if p_status not in ('pending','ready_to_ship','shipped','delivered') or p_page is null or p_page not between 0 and 100000 then raise exception 'Invalid fulfillment filter' using errcode='22023'; end if;
 return jsonb_build_object('count',(select count(*) from public.shipments s where s.status=p_status and (actor_role='admin' or s.vendor_id=actor)),
  'rows',(select coalesce(jsonb_agg(to_jsonb(page) order by page.ordered_at,page.id),'[]'::jsonb) from (
   select s.id,s.order_id,s.status,s.courier,s.service,s.tracking_number,s.shipped_at,s.delivered_at,s.created_at,s.updated_at,s.order_number,o.public_order_number,s.ordered_at,s.fulfillment_allowed,s.shipping_cost,s.provider,s.provider_reference,s.address_snapshot,s.items_snapshot,s.packing_status,s.packing_checklist,s.packed_at,s.packed_by,s.actual_shipping_cost,s.shipping_payer,s.actual_shipping_entered_at,s.actual_shipping_entered_by,
    private.shipment_customer_service(s.order_id) customer_shipping,
    coalesce((select jsonb_agg(jsonb_build_object('id',j.id,'order_number',j.order_number,'public_order_number',j.public_order_number,'quantity',j.quantity,'product_snapshot',j.product_snapshot,'formulas_snapshot',j.formulas_snapshot) order by j.created_at,j.id) from public.production_jobs j join public.order_items i on i.id=j.order_item_id where i.order_id=s.order_id),'[]'::jsonb) formula_jobs,
    coalesce((select jsonb_agg(jsonb_build_object('original_courier',h.original_courier,'original_service',h.original_service,'new_courier',h.new_courier,'new_service',h.new_service,'reason',h.reason,'overridden_at',h.created_at) order by h.created_at) from private.shipment_shipping_service_overrides h where h.shipment_id=s.id),'[]'::jsonb) shipping_override_history
   from public.shipments s join public.orders o on o.id=s.order_id where s.status=p_status and (actor_role='admin' or s.vendor_id=actor) order by s.ordered_at,s.id limit 25 offset p_page*25
  ) page));
end $$;

create or replace function private.admin_vendor_workspace(p_page integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.require_admin();
 if p_page is null or p_page not between 0 and 100000 then raise exception 'Invalid page' using errcode='22023'; end if;
 return jsonb_build_object(
  'default_vendor_id',(select default_vendor_id from private.vendor_assignment_settings where singleton=true),
  'vendors',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name,'email',p.email) order by coalesce(p.full_name,p.email),p.id),'[]'::jsonb) from public.profiles p where p.role='vendor'),
  'unassigned_count',(select count(*) from public.orders o left join public.order_vendor_assignments a on a.order_id=o.id where o.payment_status='paid' and a.order_id is null),
  'unassigned_orders',(select coalesce(jsonb_agg(to_jsonb(page) order by page.created_at desc,page.id),'[]'::jsonb) from (
   select o.id,o.order_number,o.public_order_number,o.created_at,o.status,o.grand_total,coalesce(jsonb_agg(jsonb_build_object('label',i.product_snapshot->>'label','volume_ml',i.product_snapshot->>'volume_ml','bottle_count',i.product_snapshot->>'bottle_count','quantity',i.quantity) order by i.position),'[]'::jsonb) products
   from public.orders o join public.order_items i on i.order_id=o.id left join public.order_vendor_assignments a on a.order_id=o.id
   where o.payment_status='paid' and a.order_id is null group by o.id,o.order_number,o.public_order_number,o.created_at,o.status,o.grand_total order by o.created_at desc,o.id limit 25 offset p_page*25
  ) page)
 );
end $$;

create or replace function private.admin_vendor_assignments(p_page integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.require_admin();
 if p_page is null or p_page not between 0 and 100000 then raise exception 'Invalid page' using errcode='22023'; end if;
 return jsonb_build_object('count',(select count(*) from public.order_vendor_assignments),
  'rows',(select coalesce(jsonb_agg(to_jsonb(page) order by page.assigned_at desc,page.order_id),'[]'::jsonb) from (
   select a.order_id,o.order_number,o.public_order_number,o.status,o.payment_status,a.vendor_id,jsonb_build_object('name',v.full_name,'email',v.email) vendor,a.assigned_at,a.assignment_source,a.vendor_fee_amount,a.vendor_fee_snapshot
   from public.order_vendor_assignments a join public.orders o on o.id=a.order_id join public.profiles v on v.id=a.vendor_id
   order by a.assigned_at desc,a.order_id limit 25 offset p_page*25
  ) page));
end $$;
