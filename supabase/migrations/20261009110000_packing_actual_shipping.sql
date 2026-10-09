-- Phase 3: packing and internal actual-shipping records for assigned vendors.
alter table public.shipments add column packing_status text not null default 'not_started' check(packing_status in ('not_started','in_progress','packed','legacy_unknown'));
alter table public.shipments add column packing_checklist jsonb not null default '{"bottles_checked":false,"formula_stickers_checked":false,"bottles_sealed":false,"packaging_ready":false,"recipient_label_checked":false}'::jsonb check(jsonb_typeof(packing_checklist)='object');
alter table public.shipments add column packed_at timestamptz;
alter table public.shipments add column packed_by uuid references public.profiles(id);
alter table public.shipments add column actual_shipping_cost bigint check(actual_shipping_cost is null or actual_shipping_cost>=0);
alter table public.shipments add column shipping_payer text check(shipping_payer is null or shipping_payer in ('vendor','perfun','customer'));
alter table public.shipments add column actual_shipping_entered_at timestamptz;
alter table public.shipments add column actual_shipping_entered_by uuid references public.profiles(id);
alter table public.shipments add constraint shipment_packing_checklist_shape check (
 packing_checklist ?& array['bottles_checked','formula_stickers_checked','bottles_sealed','packaging_ready','recipient_label_checked']
 and packing_checklist - array['bottles_checked','formula_stickers_checked','bottles_sealed','packaging_ready','recipient_label_checked']='{}'::jsonb
 and jsonb_typeof(packing_checklist->'bottles_checked')='boolean'
 and jsonb_typeof(packing_checklist->'formula_stickers_checked')='boolean'
 and jsonb_typeof(packing_checklist->'bottles_sealed')='boolean'
 and jsonb_typeof(packing_checklist->'packaging_ready')='boolean'
 and jsonb_typeof(packing_checklist->'recipient_label_checked')='boolean'
);

-- Do not invent a packing record for dispatches that predate this feature.
update public.shipments set packing_status='legacy_unknown' where status in ('shipped','delivered');

-- Browser customers retain only the original delivery projection. Internal fields use the authorized fulfillment RPC.
revoke select on table public.shipments from authenticated;
grant select(id,order_id,status,courier,service,tracking_number,shipping_cost,shipped_at,delivered_at,created_at,updated_at,order_number,ordered_at,address_snapshot,items_snapshot,fulfillment_allowed,provider,provider_reference) on public.shipments to authenticated;

create or replace function private.require_assigned_vendor_shipment(p_shipment_id uuid)
returns public.shipments language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); shipment public.shipments;
begin
 if actor is null or not exists(select 1 from public.profiles where id=actor and role='vendor') then raise exception 'Assigned vendor access required' using errcode='42501'; end if;
 select * into shipment from public.shipments where id=p_shipment_id for update;
 if not found or shipment.vendor_id is distinct from actor then raise exception 'Assigned vendor access required' using errcode='42501'; end if;
 return shipment;
end $$;
revoke all on function private.require_assigned_vendor_shipment(uuid) from public,anon,authenticated;

create or replace function private.save_shipment_packing(p_shipment_id uuid,p_checklist jsonb,p_complete boolean)
returns public.shipments language plpgsql security definer set search_path='' as $$
declare shipment public.shipments; required text[]:=array['bottles_checked','formula_stickers_checked','bottles_sealed','packaging_ready','recipient_label_checked']; field text; all_checked boolean;
begin
 shipment:=private.require_assigned_vendor_shipment(p_shipment_id);
 if shipment.status in ('shipped','delivered') or shipment.packing_status='legacy_unknown' then raise exception 'Historical or dispatched packing cannot be changed' using errcode='23514'; end if;
 if shipment.status<>'ready_to_ship' or not private.shipment_is_ready(shipment.order_id) then raise exception 'Complete production before packing' using errcode='23514'; end if;
 if jsonb_typeof(p_checklist) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_checklist))<>cardinality(required) or not p_checklist ?& required then raise exception 'Packing checklist is incomplete' using errcode='23514'; end if;
 foreach field in array required loop
  if jsonb_typeof(p_checklist->field) is distinct from 'boolean' then raise exception 'Packing checklist is invalid' using errcode='23514'; end if;
 end loop;
 select bool_and((p_checklist->>field)::boolean) into all_checked from unnest(required) field;
 if shipment.packing_status='packed' then
  if shipment.packing_checklist=p_checklist then return shipment; end if;
  raise exception 'Packed shipment checklist is final' using errcode='23514';
 end if;
 if p_complete and not all_checked then raise exception 'Complete every packing checklist item first' using errcode='23514'; end if;
 update public.shipments set packing_checklist=p_checklist,
  packing_status=case when p_complete then 'packed' else 'in_progress' end,
  packed_at=case when p_complete then clock_timestamp() else null end,
  packed_by=case when p_complete then auth.uid() else null end
 where id=p_shipment_id returning * into shipment;
 return shipment;
end $$;
revoke all on function private.save_shipment_packing(uuid,jsonb,boolean) from public,anon,authenticated;
create or replace function public.save_shipment_packing(p_shipment_id uuid,p_checklist jsonb,p_complete boolean default false)
returns public.shipments language sql security definer set search_path='' as $$ select private.save_shipment_packing(p_shipment_id,p_checklist,p_complete); $$;
revoke all on function public.save_shipment_packing(uuid,jsonb,boolean) from public,anon;
grant execute on function public.save_shipment_packing(uuid,jsonb,boolean) to authenticated;

create or replace function private.save_actual_shipping(p_shipment_id uuid,p_cost bigint,p_payer text)
returns public.shipments language plpgsql security definer set search_path='' as $$
declare shipment public.shipments;
begin
 shipment:=private.require_assigned_vendor_shipment(p_shipment_id);
 if p_cost is null or p_cost<0 or p_payer not in ('vendor','perfun','customer') then raise exception 'Actual shipping cost and payer are required' using errcode='23514'; end if;
 if shipment.status<>'ready_to_ship' or shipment.packing_status<>'packed' then raise exception 'Pack the shipment before finalizing actual shipping' using errcode='23514'; end if;
 update public.shipments set actual_shipping_cost=p_cost,shipping_payer=p_payer,actual_shipping_entered_at=clock_timestamp(),actual_shipping_entered_by=auth.uid()
 where id=p_shipment_id returning * into shipment;
 return shipment;
end $$;
revoke all on function private.save_actual_shipping(uuid,bigint,text) from public,anon,authenticated;
create or replace function public.save_actual_shipping(p_shipment_id uuid,p_cost bigint,p_payer text)
returns public.shipments language sql security definer set search_path='' as $$ select private.save_actual_shipping(p_shipment_id,p_cost,p_payer); $$;
revoke all on function public.save_actual_shipping(uuid,bigint,text) from public,anon;
grant execute on function public.save_actual_shipping(uuid,bigint,text) to authenticated;

-- Keep the final packing and cost requirements true even for privileged writers.
-- The payment/shipment synchronisation paths never transition a shipment to shipped.
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
 if new.status='shipped' and old.status<>'shipped' and (
   new.packing_status<>'packed' or new.actual_shipping_cost is null or new.shipping_payer is null
 ) then raise exception 'Complete packing and actual shipping before dispatch' using errcode='23514'; end if;
 return new;
end $$;
drop trigger if exists shipment_packing_shipping_guard on public.shipments;
create trigger shipment_packing_shipping_guard before update on public.shipments for each row execute function private.enforce_packing_shipping_integrity();

create or replace function private.fulfill_shipment(p_shipment_id uuid,p_action text,p_courier text,p_service text,p_tracking_number text)
returns public.shipments language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); actor_role public.app_role; parent_id uuid; shipment public.shipments; field text;
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
  update public.orders set status='completed' where id=parent_id and status<>'completed';
  return shipment;
 end if;
 p_courier:=btrim(coalesce(p_courier,'')); p_service:=btrim(coalesce(p_service,'')); p_tracking_number:=btrim(coalesce(p_tracking_number,''));
 if length(p_courier)>100 or length(p_service)>100 or length(p_tracking_number)>150 then raise exception 'Shipping details too long' using errcode='23514'; end if;
 foreach field in array array[p_courier,p_service,p_tracking_number] loop
  if field ~ '[[:cntrl:]]' or (p_action='ship' and field='') then raise exception 'Courier, service and tracking number are required' using errcode='23514'; end if;
 end loop;
 if shipment.status in ('shipped','delivered') then
  if p_action='ship' and row(shipment.courier,shipment.service,shipment.tracking_number)=row(p_courier,p_service,p_tracking_number) then return shipment; end if;
  raise exception 'Dispatched shipment cannot be edited' using errcode='23514';
 end if;
 if shipment.status<>'ready_to_ship' or not private.shipment_is_ready(parent_id) then raise exception 'Shipment is not ready: all production must be completed and fulfillment eligible' using errcode='23514'; end if;
 if shipment.packing_status<>'packed' then raise exception 'Complete packing before saving or shipping' using errcode='23514'; end if;
 if p_action='ship' and (shipment.actual_shipping_cost is null or shipment.shipping_payer is null) then raise exception 'Finalize actual shipping cost and payer before shipping' using errcode='23514'; end if;
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
   select s.id,s.order_id,s.status,s.courier,s.service,s.tracking_number,s.shipped_at,s.delivered_at,s.created_at,s.updated_at,s.order_number,s.ordered_at,s.fulfillment_allowed,s.shipping_cost,s.provider,s.provider_reference,s.address_snapshot,s.items_snapshot,s.packing_status,s.packing_checklist,s.packed_at,s.packed_by,s.actual_shipping_cost,s.shipping_payer,s.actual_shipping_entered_at,s.actual_shipping_entered_by
   from public.shipments s where s.status=p_status and (actor_role='admin' or s.vendor_id=actor) order by s.ordered_at,s.id limit 25 offset p_page*25
  ) page));
end $$;
revoke all on function private.list_fulfillment_shipments(text,integer) from public,anon,authenticated;
create or replace function public.list_fulfillment_shipments(p_status text,p_page integer default 0)
returns jsonb language sql security definer set search_path='' as $$ select private.list_fulfillment_shipments(p_status,p_page); $$;
revoke all on function public.list_fulfillment_shipments(text,integer) from public,anon;
grant execute on function public.list_fulfillment_shipments(text,integer) to authenticated;
