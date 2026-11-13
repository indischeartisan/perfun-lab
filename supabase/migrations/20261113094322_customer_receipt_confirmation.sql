-- Delivery confirmation is a separate, audited transition. Client roles never
-- receive direct shipment updates; they must use the guarded RPCs below.
create table private.shipment_delivery_confirmations (
 id uuid primary key default gen_random_uuid(),
 shipment_id uuid not null unique references public.shipments(id) on delete restrict,
 order_id uuid not null references public.orders(id) on delete restrict,
 confirmed_by uuid not null references public.profiles(id),
 confirmation_source text not null check (confirmation_source in ('customer','admin')),
 created_at timestamptz not null default clock_timestamp()
);
create index shipment_delivery_confirmations_order_created_idx
 on private.shipment_delivery_confirmations(order_id,created_at);
alter table private.shipment_delivery_confirmations enable row level security;
revoke all on private.shipment_delivery_confirmations from public,anon,authenticated;
grant all on private.shipment_delivery_confirmations to service_role;

-- One locked transition is shared by the customer-facing and admin workflows.
-- The source is not client supplied on either public RPC.
create function private.confirm_shipment_delivery(p_shipment_id uuid,p_source text)
returns public.shipments language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); actor_role public.app_role; parent_id uuid; parent public.orders; shipment public.shipments; confirmation_id uuid;
begin
 if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select role into actor_role from public.profiles where id=actor;
 if (p_source='customer' and actor_role<>'customer') or (p_source='admin' and actor_role<>'admin') then
  raise exception 'Delivery confirmation is not permitted for this role' using errcode='42501';
 end if;
 if p_source not in ('customer','admin') then raise exception 'Invalid delivery confirmation source' using errcode='22023'; end if;
 select order_id into parent_id from public.shipments where id=p_shipment_id;
 if parent_id is null then raise exception 'Shipment not found' using errcode='P0002'; end if;
 select * into parent from public.orders where id=parent_id for update;
 select * into shipment from public.shipments where id=p_shipment_id for update;
 if p_source='customer' and parent.user_id is distinct from actor then
  raise exception 'Shipment does not belong to the current customer' using errcode='42501';
 end if;
 if shipment.status='delivered' then return shipment; end if;
 if shipment.status<>'shipped' then raise exception 'Only dispatched shipments can be confirmed received' using errcode='23514'; end if;
 insert into private.shipment_delivery_confirmations(shipment_id,order_id,confirmed_by,confirmation_source)
 values(shipment.id,parent.id,actor,p_source) returning id into confirmation_id;
 perform set_config('app.delivery_confirmation_id',confirmation_id::text,true);
 update public.shipments set status='delivered',delivered_at=clock_timestamp() where id=shipment.id returning * into shipment;
 update public.orders set status='completed' where id=parent.id and status<>'completed';
 return shipment;
end $$;
revoke all on function private.confirm_shipment_delivery(uuid,text) from public,anon,authenticated;

-- Preserve finality: a delivered status is valid only in the transaction that
-- created its immutable audit record.
create or replace function private.prepare_shipment()
returns trigger language plpgsql security definer set search_path='' as $$
declare parent public.orders;
begin
 if tg_op='INSERT' then
  select * into parent from public.orders where id=new.order_id for update;
  if parent.id is null or parent.payment_status<>'paid' then raise exception 'Only paid orders can enter fulfillment' using errcode='23514'; end if;
  new.status:=case when private.shipment_is_ready(parent.id) then 'ready_to_ship' else 'pending' end;
  new.fulfillment_allowed:=(new.status='ready_to_ship');
  new.shipped_at:=null; new.delivered_at:=null; new.courier:=''; new.service:=''; new.tracking_number:='';
  new.shipping_cost:=parent.shipping; new.order_number:=parent.order_number; new.ordered_at:=parent.created_at;
  new.provider:='manual'; new.provider_reference:=null;
  new.address_snapshot:=jsonb_build_object('recipient_name',parent.address_snapshot->>'recipient_name',
   'phone',parent.address_snapshot->>'phone','address_line',parent.address_snapshot->>'address_line',
   'city',parent.address_snapshot->>'city','province',parent.address_snapshot->>'province',
   'postal_code',parent.address_snapshot->>'postal_code','district',parent.address_snapshot->>'district',
   'delivery_note',parent.address_snapshot->>'delivery_note');
  select coalesce(jsonb_agg(jsonb_build_object('product',jsonb_build_object(
   'label',product_snapshot->>'label','volume_ml',product_snapshot->'volume_ml','bottle_count',product_snapshot->'bottle_count'),
   'quantity',quantity) order by position),'[]'::jsonb) into new.items_snapshot from public.order_items where order_id=parent.id;
 else
  if row(new.id,new.order_id,new.order_number,new.ordered_at,new.address_snapshot,new.items_snapshot,new.shipping_cost,new.created_at)
   is distinct from row(old.id,old.order_id,old.order_number,old.ordered_at,old.address_snapshot,old.items_snapshot,old.shipping_cost,old.created_at) then
   raise exception 'Shipment snapshot is immutable' using errcode='23514';
  end if;
  if old.status='shipped' and (new.status not in ('shipped','delivered')
   or row(new.courier,new.service,new.shipped_at) is distinct from row(old.courier,old.service,old.shipped_at)) then
   raise exception 'Dispatched shipment cannot be rewritten' using errcode='23514';
  end if;
  if old.status='shipped' and new.tracking_number is distinct from old.tracking_number and not exists(
   select 1 from private.shipment_tracking_corrections c
   where c.id::text=current_setting('app.tracking_correction_id',true)
     and c.shipment_id=old.id and c.order_id=old.order_id
     and c.previous_tracking_number=old.tracking_number and c.new_tracking_number=new.tracking_number
     and c.corrected_by=auth.uid()
  ) then raise exception 'Dispatched shipment tracking requires the correction workflow' using errcode='23514'; end if;
  if old.status='shipped' and new.status='delivered' and not exists(
   select 1 from private.shipment_delivery_confirmations c
   where c.id::text=current_setting('app.delivery_confirmation_id',true)
     and c.shipment_id=old.id and c.order_id=old.order_id and c.confirmed_by=auth.uid()
  ) then raise exception 'Delivered shipment requires the confirmation workflow' using errcode='23514'; end if;
  if old.status='delivered' and row(new.status,new.courier,new.service,new.tracking_number,new.shipped_at,new.delivered_at)
   is distinct from row(old.status,old.courier,old.service,old.tracking_number,old.shipped_at,old.delivered_at) then
   raise exception 'Delivered shipment is final' using errcode='23514';
  end if;
  if new.status='delivered' and old.status not in ('shipped','delivered') then raise exception 'Ship before delivery' using errcode='23514'; end if;
  if new.status='ready_to_ship' or (new.status='shipped' and old.status<>'shipped') then
   perform 1 from public.orders where id=new.order_id for update;
   if not private.shipment_is_ready(new.order_id) then raise exception 'All production jobs must be completed before shipping' using errcode='23514'; end if;
  end if;
  new.updated_at:=clock_timestamp();
 end if;
 return new;
end $$;
revoke all on function private.prepare_shipment() from public,anon,authenticated;

-- Existing dispatch remains vendor/admin. Delivery, however, is admin-only and
-- always passes through the audited confirmation helper above.
create or replace function private.fulfill_shipment(p_shipment_id uuid,p_action text,p_courier text,p_service text,p_tracking_number text)
returns public.shipments language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); actor_role public.app_role; parent_id uuid; shipment public.shipments; field text; selected_service jsonb;
begin
 select role into actor_role from public.profiles where id=actor;
 if actor is null or actor_role not in ('vendor','admin') then raise exception 'Vendor or admin access required' using errcode='42501'; end if;
 if p_action is null or p_action not in ('save','ship','deliver') then raise exception 'Invalid fulfillment action' using errcode='22023'; end if;
 if p_action='deliver' then
  if actor_role<>'admin' then raise exception 'Only admins can confirm delivery' using errcode='42501'; end if;
  return private.confirm_shipment_delivery(p_shipment_id,'admin');
 end if;
 select order_id into parent_id from public.shipments where id=p_shipment_id;
 if parent_id is null then raise exception 'Shipment not found' using errcode='P0002'; end if;
 perform 1 from public.orders where id=parent_id for update;
 select * into shipment from public.shipments where id=p_shipment_id for update;
 if actor_role='vendor' and shipment.vendor_id is distinct from actor then raise exception 'Assigned vendor access required' using errcode='42501'; end if;
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

create function private.confirm_shipment_received(p_shipment_id uuid)
returns public.shipments language sql security definer set search_path='' as $$
 select private.confirm_shipment_delivery(p_shipment_id,'customer');
$$;
revoke all on function private.confirm_shipment_received(uuid) from public,anon,authenticated;

create function public.confirm_shipment_received(p_shipment_id uuid)
returns public.shipments language sql security definer set search_path='' as $$
 select private.confirm_shipment_received(p_shipment_id);
$$;
revoke all on function public.confirm_shipment_received(uuid) from public,anon;
grant execute on function public.confirm_shipment_received(uuid) to authenticated;
