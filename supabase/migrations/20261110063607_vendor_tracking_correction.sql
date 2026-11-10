-- Tracking corrections are limited to dispatched shipments. The audit trail is
-- private and the only client-facing write path is the guarded RPC below.
create table private.shipment_tracking_corrections (
 id uuid primary key default gen_random_uuid(),
 shipment_id uuid not null references public.shipments(id) on delete restrict,
 order_id uuid not null references public.orders(id) on delete restrict,
 previous_tracking_number text not null check(length(btrim(previous_tracking_number)) between 1 and 150),
 new_tracking_number text not null check(length(btrim(new_tracking_number)) between 1 and 150),
 corrected_by uuid not null references public.profiles(id),
 created_at timestamptz not null default clock_timestamp(),
 check(previous_tracking_number <> new_tracking_number)
);
create index shipment_tracking_corrections_shipment_created_idx
 on private.shipment_tracking_corrections(shipment_id,created_at);
alter table private.shipment_tracking_corrections enable row level security;
revoke all on private.shipment_tracking_corrections from public,anon,authenticated;
grant all on private.shipment_tracking_corrections to service_role;

-- Preserve shipment finality. A shipped tracking number may change only when
-- this transaction carries the exact audit record inserted by the guarded RPC.
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

create function private.correct_shipment_tracking(p_shipment_id uuid,p_tracking_number text)
returns public.shipments language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); actor_role public.app_role; shipment public.shipments; tracking_value text:=btrim(coalesce(p_tracking_number,'')); correction_id uuid;
begin
 select role into actor_role from public.profiles where id=actor;
 if actor is null or actor_role not in ('vendor','admin') then
  raise exception 'Vendor or admin access required' using errcode='42501';
 end if;
 if length(tracking_value) not between 1 and 150 or tracking_value~'[[:cntrl:]]' then
  raise exception 'A valid tracking number is required' using errcode='23514';
 end if;
 perform 1 from public.orders o join public.shipments s on s.order_id=o.id where s.id=p_shipment_id for update of o,s;
 select * into shipment from public.shipments where id=p_shipment_id for update;
 if not found then raise exception 'Shipment not found' using errcode='P0002'; end if;
 if actor_role='vendor' and shipment.vendor_id is distinct from actor then
  raise exception 'Assigned vendor access required' using errcode='42501';
 end if;
 if shipment.status<>'shipped' then
  raise exception 'Only dispatched shipments can have their tracking number corrected' using errcode='23514';
 end if;
 if shipment.tracking_number=tracking_value then return shipment; end if;
 insert into private.shipment_tracking_corrections(shipment_id,order_id,previous_tracking_number,new_tracking_number,corrected_by)
 values(shipment.id,shipment.order_id,shipment.tracking_number,tracking_value,actor)
 returning id into correction_id;
 perform set_config('app.tracking_correction_id',correction_id::text,true);
 update public.shipments set tracking_number=tracking_value where id=shipment.id returning * into shipment;
 return shipment;
end $$;
revoke all on function private.correct_shipment_tracking(uuid,text) from public,anon,authenticated;

create function public.correct_shipment_tracking(p_shipment_id uuid,p_tracking_number text)
returns public.shipments language sql security definer set search_path='' as $$
 select private.correct_shipment_tracking(p_shipment_id,p_tracking_number);
$$;
revoke all on function public.correct_shipment_tracking(uuid,text) from public,anon;
grant execute on function public.correct_shipment_tracking(uuid,text) to authenticated;
