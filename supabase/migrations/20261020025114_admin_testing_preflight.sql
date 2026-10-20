-- Review-only foundation. This migration does not create a test order, mark a
-- payment paid, start production, dispatch a shipment, or enable a workflow.
-- Enabling preflight is not approval or authorization to process an order.
create table private.admin_testing_preflight_settings (
 singleton boolean primary key default true check (singleton),
 enabled boolean not null default false
);
alter table private.admin_testing_preflight_settings enable row level security;
revoke all on private.admin_testing_preflight_settings from public, anon, authenticated;
grant select, update on private.admin_testing_preflight_settings to service_role;
insert into private.admin_testing_preflight_settings(singleton, enabled) values (true, false);

-- Return a conservative, informational assessment only. This result can go
-- stale immediately: a later processing transaction MUST lock the order and
-- revalidate payment attempts and every other guard before doing anything.
create function public.admin_testing_preflight(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 parent public.orders;
 reason text;
begin
 perform private.require_admin();
 if p_order_id is null then raise exception 'Order ID is required' using errcode='22023'; end if;

 if not coalesce((select enabled from private.admin_testing_preflight_settings where singleton), false) then
  return jsonb_build_object('preflight_enabled',false,'candidate',false,'workflow_available',false,'reason','disabled');
 end if;

 select * into parent from public.orders where id=p_order_id;
 if not found then
  reason:='not_found';
 elsif parent.status<>'pending_payment' or parent.payment_status<>'pending' then
  reason:='not_pending';
 -- Even expired/failed attempts can receive a late provider notification. Do
 -- not treat them as safe until a transactional policy has been approved.
 elsif exists(select 1 from public.payments where order_id=parent.id) then
  reason:='payment_history';
 elsif not exists(select 1 from public.order_items where order_id=parent.id) then
  reason:='no_items';
 elsif exists(select 1 from public.production_jobs j join public.order_items i on i.id=j.order_item_id where i.order_id=parent.id)
    or exists(select 1 from public.shipments where order_id=parent.id)
    or exists(select 1 from public.order_vendor_assignments where order_id=parent.id)
    or exists(select 1 from public.vendor_payout_items where order_id=parent.id) then
  reason:='existing_operations';
 else
  reason:='candidate_only';
 end if;

 return jsonb_build_object('preflight_enabled',true,'candidate',reason='candidate_only',
  'workflow_available',false,'reason',reason);
end $$;
revoke all on function public.admin_testing_preflight(uuid) from public, anon, authenticated;
grant execute on function public.admin_testing_preflight(uuid) to authenticated;
