-- The vendor dispatch action continues to require: an assigned vendor (or admin),
-- a ready shipment, the customer-selected courier/service, and a tracking number.
-- Packing and actual-cost data stay historical/auditable, but are no longer gates.
-- Keep the finality protection for historical packing/cost data after dispatch,
-- while removing the former trigger-level requirement that those fields exist
-- before a shipment may be dispatched.
create or replace function private.enforce_packing_shipping_integrity()
returns trigger language plpgsql set search_path='' as $$
begin
 if old.status in ('shipped','delivered') and (
   new.packing_status is distinct from old.packing_status or
   new.packing_checklist is distinct from old.packing_checklist or
   new.packed_at is distinct from old.packed_at or
   new.packed_by is distinct from old.packed_by or
   new.actual_shipping_cost is distinct from old.actual_shipping_cost or
   new.shipping_payer is distinct from old.shipping_payer or
   new.actual_shipping_entered_at is distinct from old.actual_shipping_entered_at or
   new.actual_shipping_entered_by is distinct from old.actual_shipping_entered_by
 ) then raise exception 'Dispatched shipment packing and actual shipping are final' using errcode='23514'; end if;
 return new;
end $$;

create or replace function private.fulfill_shipment(p_shipment_id uuid,p_action text,p_courier text,p_service text,p_tracking_number text)
returns public.shipments language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); actor_role public.app_role; parent_id uuid; shipment public.shipments; field text; selected_service jsonb;
begin
 select role into actor_role from public.profiles where id=actor;
 if actor is null or actor_role not in ('vendor','admin') then raise exception 'Vendor or admin access required' using errcode='42501'; end if;
 if p_action is null or p_action not in ('save','ship','deliver') then raise exception 'Invalid fulfillment action' using errcode='22023'; end if;
 select order_id into parent_id from public.shipments where id=p_shipment_id;
 if parent_id is null then raise exception 'Shipment not found' using errcode='P0002'; end if;
 perform 1 from public.orders where id=parent_id for update;
 select * into shipment from public.shipments where id=p_shipment_id for update;
 if actor_role='vendor' and shipment.vendor_id is distinct from actor then raise exception 'Assigned vendor access required' using errcode='42501'; end if;
 if p_action='deliver' then
  if shipment.status='delivered' then return shipment; end if;
  if shipment.status<>'shipped' then raise exception 'Ship before marking delivered' using errcode='23514'; end if;
  update public.shipments set status='delivered',delivered_at=clock_timestamp() where id=p_shipment_id returning * into shipment;
  update public.orders set status='completed' where id=parent_id and status<>'completed'; return shipment;
 end if;
 p_courier:=btrim(coalesce(p_courier,'')); p_service:=btrim(coalesce(p_service,'')); p_tracking_number:=btrim(coalesce(p_tracking_number,''));
 if length(p_courier)>100 or length(p_service)>100 or length(p_tracking_number)>150 then raise exception 'Shipping details too long' using errcode='23514'; end if;
 foreach field in array array[p_courier,p_service,p_tracking_number] loop
  if field~'[[:cntrl:]]' or (p_action='ship' and field='') then raise exception 'Courier, service and tracking number are required' using errcode='23514'; end if;
 end loop;
 if shipment.status in ('shipped','delivered') then
  if p_action='ship' and row(shipment.courier,shipment.service,shipment.tracking_number)=row(p_courier,p_service,p_tracking_number) then return shipment; end if;
  raise exception 'Dispatched shipment cannot be edited' using errcode='23514';
 end if;
 if shipment.status<>'ready_to_ship' or not private.shipment_is_ready(parent_id) then raise exception 'Shipment is not ready: all production must be completed and fulfillment eligible' using errcode='23514'; end if;
 selected_service:=private.shipment_customer_service(parent_id);
 if selected_service is not null and row(p_courier,p_service) is distinct from row(shipment.courier,shipment.service) then raise exception 'Customer shipping service is locked; use the admin override workflow' using errcode='23514'; end if;
 if actor_role='admin' and row(p_courier,p_service) is distinct from row(shipment.courier,shipment.service) then raise exception 'Admin service changes require an override reason' using errcode='23514'; end if;
 if p_action='save' and row(shipment.courier,shipment.service,shipment.tracking_number)=row(p_courier,p_service,p_tracking_number) then return shipment; end if;
 update public.shipments set courier=p_courier,service=p_service,tracking_number=p_tracking_number,status=case when p_action='ship' then 'shipped' else status end,shipped_at=case when p_action='ship' then clock_timestamp() else shipped_at end where id=p_shipment_id returning * into shipment;
 if p_action='ship' then update public.orders set status='shipped' where id=parent_id and status<>'shipped'; end if;
 return shipment;
end $$;

-- Keep the vendor list to one RPC: formula snapshots are returned with their order.
create or replace function private.list_fulfillment_shipments(p_status text,p_page integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); actor_role public.app_role;
begin
 select role into actor_role from public.profiles where id=actor;
 if actor is null or actor_role not in ('vendor','admin') then raise exception 'Vendor or admin access required' using errcode='42501'; end if;
 if p_status not in ('pending','ready_to_ship','shipped','delivered') or p_page is null or p_page not between 0 and 100000 then raise exception 'Invalid fulfillment filter' using errcode='22023'; end if;
 return jsonb_build_object('count',(select count(*) from public.shipments s where s.status=p_status and (actor_role='admin' or s.vendor_id=actor)),
  'rows',(select coalesce(jsonb_agg(to_jsonb(page) order by page.ordered_at,page.id),'[]'::jsonb) from (
   select s.id,s.order_id,s.status,s.courier,s.service,s.tracking_number,s.shipped_at,s.delivered_at,s.created_at,s.updated_at,s.order_number,s.ordered_at,s.fulfillment_allowed,s.shipping_cost,s.provider,s.provider_reference,s.address_snapshot,s.items_snapshot,s.packing_status,s.packing_checklist,s.packed_at,s.packed_by,s.actual_shipping_cost,s.shipping_payer,s.actual_shipping_entered_at,s.actual_shipping_entered_by,
    private.shipment_customer_service(s.order_id) customer_shipping,
    coalesce((select jsonb_agg(jsonb_build_object('id',j.id,'order_number',j.order_number,'quantity',j.quantity,'product_snapshot',j.product_snapshot,'formulas_snapshot',j.formulas_snapshot) order by j.created_at,j.id) from public.production_jobs j join public.order_items i on i.id=j.order_item_id where i.order_id=s.order_id),'[]'::jsonb) formula_jobs,
    coalesce((select jsonb_agg(jsonb_build_object('original_courier',h.original_courier,'original_service',h.original_service,'new_courier',h.new_courier,'new_service',h.new_service,'reason',h.reason,'overridden_at',h.created_at) order by h.created_at) from private.shipment_shipping_service_overrides h where h.shipment_id=s.id),'[]'::jsonb) shipping_override_history
   from public.shipments s where s.status=p_status and (actor_role='admin' or s.vendor_id=actor) order by s.ordered_at,s.id limit 25 offset p_page*25
  ) page));
end $$;
