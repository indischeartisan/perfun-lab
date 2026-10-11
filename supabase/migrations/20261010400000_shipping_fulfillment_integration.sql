-- Phase 5D: project the immutable customer shipping selection into fulfillment.
-- Customer shipping is read from orders.shipping_quote_snapshot; only admin overrides are audited separately.

create table private.shipment_shipping_service_overrides (
 id uuid primary key default gen_random_uuid(),
 shipment_id uuid not null references public.shipments(id) on delete restrict,
 order_id uuid not null references public.orders(id) on delete restrict,
 original_courier text not null check(length(btrim(original_courier)) between 1 and 100),
 original_service text not null check(length(btrim(original_service)) between 1 and 100),
 new_courier text not null check(length(btrim(new_courier)) between 1 and 100),
 new_service text not null check(length(btrim(new_service)) between 1 and 100),
 reason text not null check(length(btrim(reason)) between 3 and 1000),
 overridden_by uuid not null references public.profiles(id),
 created_at timestamptz not null default clock_timestamp(),
 check(original_courier<>new_courier or original_service<>new_service)
);
create index shipment_shipping_service_overrides_shipment_idx on private.shipment_shipping_service_overrides(shipment_id,created_at);
alter table private.shipment_shipping_service_overrides enable row level security;
revoke all on private.shipment_shipping_service_overrides from public,anon,authenticated;
grant all on private.shipment_shipping_service_overrides to service_role;

create or replace function private.shipment_customer_service(p_order_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select case when jsonb_typeof(o.shipping_quote_snapshot)='object'
   and length(btrim(coalesce(o.shipping_quote_snapshot->>'courier_name',o.shipping_quote_snapshot->>'courier_code','')))>0
   and length(btrim(coalesce(o.shipping_quote_snapshot->>'service','')))>0
 then jsonb_build_object(
   'courier',coalesce(nullif(btrim(o.shipping_quote_snapshot->>'courier_name'),''),btrim(o.shipping_quote_snapshot->>'courier_code')),
   'service',btrim(o.shipping_quote_snapshot->>'service'),
   'amount',coalesce((o.shipping_quote_snapshot->>'amount')::bigint,o.shipping),
   'quote_id',o.shipping_quote_snapshot->>'quote_id'
 ) else null end
 from public.orders o where o.id=p_order_id;
$$;
revoke all on function private.shipment_customer_service(uuid) from public,anon,authenticated;

create or replace function private.default_shipment_customer_service()
returns trigger language plpgsql security definer set search_path='' as $$
declare customer_service jsonb;
begin
 if tg_op<>'INSERT' then return new; end if;
 customer_service:=private.shipment_customer_service(new.order_id);
 if customer_service is not null then
  new.courier:=customer_service->>'courier';
  new.service:=customer_service->>'service';
  new.provider:='rajaongkir';
  new.provider_reference:=nullif(customer_service->>'quote_id','');
 end if;
 return new;
end $$;
revoke all on function private.default_shipment_customer_service() from public,anon,authenticated;
drop trigger if exists zz_shipment_customer_service_default on public.shipments;
create trigger zz_shipment_customer_service_default before insert on public.shipments
 for each row execute function private.default_shipment_customer_service();

-- Backfill only mutable, blank fulfillment projections. Historical dispatched rows are untouched.
with projected as (
 select s.id,private.shipment_customer_service(s.order_id) customer_service
 from public.shipments s
 where s.status in ('pending','ready_to_ship') and btrim(s.courier)='' and btrim(s.service)=''
)
update public.shipments s set courier=projected.customer_service->>'courier',service=projected.customer_service->>'service',
 provider='rajaongkir',provider_reference=nullif(projected.customer_service->>'quote_id','')
from projected where s.id=projected.id and projected.customer_service is not null;

create or replace function private.admin_override_shipment_service(p_shipment_id uuid,p_courier text,p_service text,p_reason text)
returns public.shipments language plpgsql security definer set search_path='' as $$
declare shipment public.shipments; actor uuid:=auth.uid(); courier_value text:=btrim(coalesce(p_courier,'')); service_value text:=btrim(coalesce(p_service,'')); reason_value text:=btrim(coalesce(p_reason,''));
begin
 perform private.require_admin();
 if length(courier_value) not between 1 and 100 or length(service_value) not between 1 and 100 or length(reason_value) not between 3 and 1000
  or courier_value~'[[:cntrl:]]' or service_value~'[[:cntrl:]]' or reason_value~'[[:cntrl:]]' then
  raise exception 'Valid courier, service, and override reason are required' using errcode='23514';
 end if;
 perform 1 from public.orders o join public.shipments s on s.order_id=o.id where s.id=p_shipment_id for update of o,s;
 select * into shipment from public.shipments where id=p_shipment_id for update;
 if not found then raise exception 'Shipment not found' using errcode='P0002'; end if;
 if shipment.status in ('shipped','delivered') then raise exception 'Dispatched shipment service requires a correction workflow' using errcode='23514'; end if;
 if row(shipment.courier,shipment.service)=row(courier_value,service_value) then raise exception 'Shipping service is unchanged' using errcode='23514'; end if;
 insert into private.shipment_shipping_service_overrides(shipment_id,order_id,original_courier,original_service,new_courier,new_service,reason,overridden_by)
 values(shipment.id,shipment.order_id,shipment.courier,shipment.service,courier_value,service_value,reason_value,actor);
 update public.shipments set courier=courier_value,service=service_value where id=shipment.id returning * into shipment;
 return shipment;
end $$;
revoke all on function private.admin_override_shipment_service(uuid,text,text,text) from public,anon,authenticated;
create function public.admin_override_shipment_service(p_shipment_id uuid,p_courier text,p_service text,p_reason text)
returns public.shipments language sql security definer set search_path='' as $$ select private.admin_override_shipment_service(p_shipment_id,p_courier,p_service,p_reason); $$;
revoke all on function public.admin_override_shipment_service(uuid,text,text,text) from public,anon;
grant execute on function public.admin_override_shipment_service(uuid,text,text,text) to authenticated;

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
 if shipment.packing_status<>'packed' then raise exception 'Complete packing before saving or shipping' using errcode='23514'; end if;
 if p_action='ship' and (shipment.actual_shipping_cost is null or shipment.shipping_payer is null) then raise exception 'Finalize actual shipping cost and payer before shipping' using errcode='23514'; end if;
 selected_service:=private.shipment_customer_service(parent_id);
 if selected_service is not null and row(p_courier,p_service) is distinct from row(shipment.courier,shipment.service) then
  raise exception 'Customer shipping service is locked; use the admin override workflow' using errcode='23514';
 end if;
 if actor_role='admin' and row(p_courier,p_service) is distinct from row(shipment.courier,shipment.service) then
  raise exception 'Admin service changes require an override reason' using errcode='23514';
 end if;
 if p_action='save' and row(shipment.courier,shipment.service,shipment.tracking_number)=row(p_courier,p_service,p_tracking_number) then return shipment; end if;
 update public.shipments set courier=p_courier,service=p_service,tracking_number=p_tracking_number,status=case when p_action='ship' then 'shipped' else status end,shipped_at=case when p_action='ship' then clock_timestamp() else shipped_at end where id=p_shipment_id returning * into shipment;
 if p_action='ship' then update public.orders set status='shipped' where id=parent_id and status<>'shipped'; end if;
 return shipment;
end $$;

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
    coalesce((select jsonb_agg(jsonb_build_object('original_courier',h.original_courier,'original_service',h.original_service,'new_courier',h.new_courier,'new_service',h.new_service,'reason',h.reason,'overridden_at',h.created_at) order by h.created_at) from private.shipment_shipping_service_overrides h where h.shipment_id=s.id),'[]'::jsonb) shipping_override_history
   from public.shipments s where s.status=p_status and (actor_role='admin' or s.vendor_id=actor) order by s.ordered_at,s.id limit 25 offset p_page*25
  ) page));
end $$;
