create table public.shipments (
 id uuid primary key default gen_random_uuid(), order_id uuid not null unique references public.orders(id),
 status text not null default 'pending' check(status in ('pending','ready_to_ship','shipped','delivered')),
 courier text not null default '', service text not null default '', tracking_number text not null default '',
 shipping_cost bigint not null check(shipping_cost>=0),
 shipped_at timestamptz, delivered_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 order_number text not null, ordered_at timestamptz not null,
 address_snapshot jsonb not null, items_snapshot jsonb not null,
 fulfillment_allowed boolean not null default false,
 provider text not null default 'manual', provider_reference text,
 check(length(courier)<=100 and length(service)<=100 and length(tracking_number)<=150),
 check ((status in ('pending','ready_to_ship') and shipped_at is null and delivered_at is null)
  or (status='shipped' and shipped_at is not null and delivered_at is null)
  or (status='delivered' and shipped_at is not null and delivered_at is not null and delivered_at>=shipped_at)),
 check(status not in ('shipped','delivered') or (length(btrim(courier))>0 and length(btrim(service))>0 and length(btrim(tracking_number))>0))
);
create index shipments_queue_idx on public.shipments(status,ordered_at,id);
alter table public.shipments enable row level security;
revoke all on public.shipments from public,anon,authenticated;
grant select on public.shipments to authenticated;
grant all on public.shipments to service_role;
create policy shipments_read on public.shipments for select to authenticated using (
 (select exists(select 1 from public.profiles where id=(select auth.uid()) and role in ('vendor','admin')))
 or exists(select 1 from public.orders o where o.id=order_id and o.user_id=(select auth.uid()))
);

-- Only privileged internal callers can inspect production eligibility and hidden order data.
create function private.shipment_is_ready(p_order_id uuid) returns boolean
language sql security invoker set search_path='' as $$
 select exists(select 1 from public.orders where id=p_order_id and payment_status='paid' and status<>'cancelled')
 and exists(select 1 from public.order_items where order_id=p_order_id)
 and not exists(select 1 from public.order_items i left join public.production_jobs j on j.order_item_id=i.id
   where i.order_id=p_order_id and (j.id is null or j.status<>'completed'));
$$;
revoke all on function private.shipment_is_ready(uuid) from public,anon,authenticated;

create function private.prepare_shipment() returns trigger
language plpgsql security definer set search_path='' as $$
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
  if old.status in ('shipped','delivered') and (new.status not in ('shipped','delivered')
   or row(new.courier,new.service,new.tracking_number,new.shipped_at) is distinct from row(old.courier,old.service,old.tracking_number,old.shipped_at)) then
   raise exception 'Dispatched shipment cannot be rewritten' using errcode='23514';
  end if;
  if old.status='delivered' and row(new.status,new.delivered_at) is distinct from row(old.status,old.delivered_at) then
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
create trigger shipment_guard before insert or update on public.shipments for each row execute function private.prepare_shipment();

create function private.sync_order_shipment(p_order_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare parent public.orders; ready boolean;
begin
 select * into parent from public.orders where id=p_order_id for update;
 if not found then return; end if;
 -- Order lock serializes concurrent final job completions and vendor actions.
 if parent.payment_status='paid' and exists(select 1 from public.order_items where order_id=parent.id) then
  insert into public.shipments(order_id) values(parent.id) on conflict(order_id) do nothing;
 end if;
 ready:=private.shipment_is_ready(parent.id);
 update public.shipments set status=case when ready then 'ready_to_ship' else 'pending' end,fulfillment_allowed=ready
  where order_id=parent.id and status in ('pending','ready_to_ship')
  and (fulfillment_allowed is distinct from ready or status<>case when ready then 'ready_to_ship' else 'pending' end);
end $$;
revoke all on function private.sync_order_shipment(uuid) from public,anon,authenticated;

create function private.sync_shipment_trigger() returns trigger
language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 if tg_table_name='orders' then target:=new.id;
 else select order_id into target from public.order_items where id=new.order_item_id;
 end if;
 perform private.sync_order_shipment(target);
 return new;
end $$;
revoke all on function private.sync_shipment_trigger() from public,anon,authenticated;
create trigger shipment_on_production after insert or update of status on public.production_jobs
 for each row execute function private.sync_shipment_trigger();
create trigger shipment_on_order after update of payment_status,status on public.orders
 for each row execute function private.sync_shipment_trigger();

-- Existing paid orders enter the same lifecycle; no invented tracking or delivery dates.
do $$ declare target uuid; begin
 for target in select id from public.orders where payment_status='paid' order by created_at loop
  perform private.sync_order_shipment(target);
 end loop;
end $$;

create function private.fulfill_shipment(p_shipment_id uuid,p_action text,p_courier text,p_service text,p_tracking_number text)
returns public.shipments language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); parent_id uuid; shipment public.shipments; field text;
begin
 if actor is null or not exists(select 1 from public.profiles where id=actor and role in ('vendor','admin')) then
  raise exception 'Vendor or admin access required' using errcode='42501';
 end if;
 if p_action is null or p_action not in ('save','ship','deliver') then raise exception 'Invalid fulfillment action' using errcode='22023'; end if;
 select order_id into parent_id from public.shipments where id=p_shipment_id;
 if parent_id is null then raise exception 'Shipment not found' using errcode='P0002'; end if;
 perform 1 from public.orders where id=parent_id for update;
 select * into shipment from public.shipments where id=p_shipment_id for update;
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
 if shipment.status<>'ready_to_ship' or not private.shipment_is_ready(parent_id) then
  raise exception 'Shipment is not ready: all production must be completed and fulfillment eligible' using errcode='23514';
 end if;
 if p_action='save' and row(shipment.courier,shipment.service,shipment.tracking_number)=row(p_courier,p_service,p_tracking_number) then return shipment; end if;
 update public.shipments set courier=p_courier,service=p_service,tracking_number=p_tracking_number,
  status=case when p_action='ship' then 'shipped' else status end,
  shipped_at=case when p_action='ship' then clock_timestamp() else shipped_at end
  where id=p_shipment_id returning * into shipment;
 if p_action='ship' then update public.orders set status='shipped' where id=parent_id and status<>'shipped'; end if;
 return shipment;
end $$;
revoke all on function private.fulfill_shipment(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function private.fulfill_shipment(uuid,text,text,text,text) to authenticated;
create function public.fulfill_shipment(p_shipment_id uuid,p_action text,p_courier text default '',p_service text default '',p_tracking_number text default '')
returns public.shipments language sql security invoker set search_path='' as $$
 select private.fulfill_shipment(p_shipment_id,p_action,p_courier,p_service,p_tracking_number);
$$;
revoke all on function public.fulfill_shipment(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.fulfill_shipment(uuid,text,text,text,text) to authenticated;
