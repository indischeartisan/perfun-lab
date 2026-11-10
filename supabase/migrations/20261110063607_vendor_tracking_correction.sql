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

create function private.correct_shipment_tracking(p_shipment_id uuid,p_tracking_number text)
returns public.shipments language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); actor_role public.app_role; shipment public.shipments; tracking_value text:=btrim(coalesce(p_tracking_number,''));
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
 values(shipment.id,shipment.order_id,shipment.tracking_number,tracking_value,actor);
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
