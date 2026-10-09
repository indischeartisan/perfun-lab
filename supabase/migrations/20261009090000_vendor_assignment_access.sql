-- Vendor Workspace phase 2: one explicitly assigned vendor may produce and fulfill an order.
-- `perfumer` remains a compatibility role for unassigned historical work; it is not removed here.

create table public.order_vendor_assignments (
 order_id uuid primary key references public.orders(id),
 vendor_id uuid not null references public.profiles(id),
 assigned_by uuid references public.profiles(id),
 assigned_at timestamptz not null default clock_timestamp(),
 assignment_source text not null default 'manual' check(assignment_source in ('manual','default','backfill')),
 vendor_fee_amount bigint not null check(vendor_fee_amount>=0),
 vendor_fee_snapshot jsonb not null check(jsonb_typeof(vendor_fee_snapshot)='object'),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index order_vendor_assignments_vendor_idx on public.order_vendor_assignments(vendor_id,assigned_at desc,order_id);
alter table public.order_vendor_assignments enable row level security;
revoke all on public.order_vendor_assignments from public,anon,authenticated;
grant all on public.order_vendor_assignments to service_role;
create trigger order_vendor_assignments_touch_updated_at before update on public.order_vendor_assignments
 for each row execute function private.touch_updated_at();

-- Configuration is deliberately private. Absence of a row (or a NULL vendor) means no auto-assignment.
create table private.vendor_assignment_settings (
 singleton boolean primary key default true check(singleton),
 default_vendor_id uuid references public.profiles(id),
 updated_by uuid references public.profiles(id),
 updated_at timestamptz not null default now()
);
alter table private.vendor_assignment_settings enable row level security;
revoke all on private.vendor_assignment_settings from public,anon,authenticated;
grant usage on schema private to service_role;
grant all on private.vendor_assignment_settings to service_role;

alter table public.production_jobs add column vendor_id uuid references public.profiles(id);
alter table public.shipments add column vendor_id uuid references public.profiles(id);
create index production_jobs_vendor_queue_idx on public.production_jobs(vendor_id,status,ordered_at,id) where vendor_id is not null;
create index shipments_vendor_queue_idx on public.shipments(vendor_id,status,ordered_at,id) where vendor_id is not null;

create or replace function private.vendor_fee_snapshot(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare item public.order_items; product_id text; unit_fee bigint; line_fee bigint;
 lines jsonb:='[]'::jsonb; total bigint:=0;
begin
 for item in select * from public.order_items where order_id=p_order_id order by position loop
  product_id:=item.product_snapshot->>'id';
  unit_fee:=case product_id when '10ml' then 50000 when '30ml' then 100000 when 'bundle-3x10ml' then 150000 else null end;
  if unit_fee is null then raise exception 'Unsupported product snapshot for vendor fee' using errcode='23514'; end if;
  line_fee:=unit_fee*item.quantity;
  total:=total+line_fee;
  lines:=lines||jsonb_build_array(jsonb_build_object('position',item.position,'product_id',product_id,
   'quantity',item.quantity,'unit_fee',unit_fee,'line_fee',line_fee));
 end loop;
 if total=0 then raise exception 'Order has no vendor-fee items' using errcode='23514'; end if;
 return jsonb_build_object('policy_version',1,'currency','IDR','lines',lines,'total_fee',total);
end $$;
revoke all on function private.vendor_fee_snapshot(uuid) from public,anon,authenticated;

create or replace function private.assign_vendor_to_order(p_order_id uuid,p_vendor_id uuid,p_assigned_by uuid,p_source text)
returns public.order_vendor_assignments language plpgsql security definer set search_path='' as $$
declare parent public.orders; assignment public.order_vendor_assignments; snapshot jsonb; target_role public.app_role;
begin
 if p_source not in ('manual','default','backfill') then raise exception 'Invalid assignment source' using errcode='22023'; end if;
 select * into parent from public.orders where id=p_order_id for update;
 if not found then raise exception 'Order not found' using errcode='P0002'; end if;
 if parent.payment_status<>'paid' then raise exception 'Only paid orders can be assigned' using errcode='23514'; end if;
 select role into target_role from public.profiles where id=p_vendor_id for share;
 if target_role is distinct from 'vendor' then raise exception 'Assigned account must be an active vendor' using errcode='23514'; end if;
 select * into assignment from public.order_vendor_assignments where order_id=p_order_id for update;
 if found then
  if assignment.vendor_id=p_vendor_id then return assignment; end if;
  -- Assignment and its fee snapshot are immutable. This also rejects changes after production starts.
  raise exception 'Order already has an immutable vendor assignment' using errcode='23514';
 end if;
 if exists(select 1 from public.production_jobs where order_item_id in (select id from public.order_items where order_id=p_order_id) and status<>'queued') then
  raise exception 'Cannot assign or change vendor after production has started' using errcode='23514';
 end if;
 if exists(select 1 from public.shipments where order_id=p_order_id and status in ('shipped','delivered')) then
  raise exception 'Cannot assign or change vendor after shipment dispatch' using errcode='23514';
 end if;
 snapshot:=private.vendor_fee_snapshot(p_order_id);
 insert into public.order_vendor_assignments(order_id,vendor_id,assigned_by,assignment_source,vendor_fee_amount,vendor_fee_snapshot)
 values(p_order_id,p_vendor_id,p_assigned_by,p_source,(snapshot->>'total_fee')::bigint,snapshot)
 returning * into assignment;
 update public.production_jobs set vendor_id=p_vendor_id
  where order_item_id in (select id from public.order_items where order_id=p_order_id) and vendor_id is null;
 update public.shipments set vendor_id=p_vendor_id where order_id=p_order_id and vendor_id is null;
 return assignment;
end $$;
revoke all on function private.assign_vendor_to_order(uuid,uuid,uuid,text) from public,anon,authenticated;

create or replace function private.admin_assign_vendor(p_order_id uuid,p_vendor_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare assignment public.order_vendor_assignments;
begin
 perform private.require_admin();
 assignment:=private.assign_vendor_to_order(p_order_id,p_vendor_id,auth.uid(),'manual');
 return jsonb_build_object('order_id',assignment.order_id,'vendor_id',assignment.vendor_id,
  'vendor_fee_amount',assignment.vendor_fee_amount,'vendor_fee_snapshot',assignment.vendor_fee_snapshot,
  'assigned_at',assignment.assigned_at);
end $$;
revoke all on function private.admin_assign_vendor(uuid,uuid) from public,anon,authenticated;

create or replace function public.admin_assign_vendor(p_order_id uuid,p_vendor_id uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.admin_assign_vendor(p_order_id,p_vendor_id); $$;
revoke all on function public.admin_assign_vendor(uuid,uuid) from public,anon;
grant execute on function public.admin_assign_vendor(uuid,uuid) to authenticated;

create or replace function private.admin_vendor_assignments(p_page integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.require_admin();
 if p_page is null or p_page not between 0 and 100000 then raise exception 'Invalid page' using errcode='22023'; end if;
 return jsonb_build_object('count',(select count(*) from public.order_vendor_assignments),
  'rows',(select coalesce(jsonb_agg(to_jsonb(page) order by page.assigned_at desc,page.order_id),'[]'::jsonb) from (
   select a.order_id,o.order_number,o.status,o.payment_status,a.vendor_id,
    jsonb_build_object('name',v.full_name,'email',v.email) vendor,
    a.assigned_at,a.assignment_source,a.vendor_fee_amount,a.vendor_fee_snapshot
   from public.order_vendor_assignments a join public.orders o on o.id=a.order_id join public.profiles v on v.id=a.vendor_id
   order by a.assigned_at desc,a.order_id limit 25 offset p_page*25
  ) page));
end $$;
revoke all on function private.admin_vendor_assignments(integer) from public,anon,authenticated;
create or replace function public.admin_vendor_assignments(p_page integer default 0)
returns jsonb language sql security invoker set search_path='' as $$ select private.admin_vendor_assignments(p_page); $$;
revoke all on function public.admin_vendor_assignments(integer) from public,anon;
grant execute on function public.admin_vendor_assignments(integer) to authenticated;

create or replace function private.admin_set_default_vendor(p_vendor_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare target_role public.app_role;
begin
 perform private.require_admin();
 if p_vendor_id is not null then
  select role into target_role from public.profiles where id=p_vendor_id for share;
  if target_role is distinct from 'vendor' then raise exception 'Default account must be an active vendor' using errcode='23514'; end if;
 end if;
 insert into private.vendor_assignment_settings(singleton,default_vendor_id,updated_by,updated_at)
 values(true,p_vendor_id,auth.uid(),clock_timestamp())
 on conflict(singleton) do update set default_vendor_id=excluded.default_vendor_id,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
end $$;
revoke all on function private.admin_set_default_vendor(uuid) from public,anon,authenticated;
create or replace function public.admin_set_default_vendor(p_vendor_id uuid default null)
returns void language sql security invoker set search_path='' as $$ select private.admin_set_default_vendor(p_vendor_id); $$;
revoke all on function public.admin_set_default_vendor(uuid) from public,anon;
grant execute on function public.admin_set_default_vendor(uuid) to authenticated;

-- A repeated payment event can repeat this trigger safely: order_id is unique and the private helper returns the same assignment.
create or replace function private.auto_assign_paid_vendor() returns trigger
language plpgsql security definer set search_path='' as $$
declare default_vendor uuid; target_role public.app_role;
begin
 if new.payment_status<>'paid' or old.payment_status='paid' or exists(select 1 from public.order_vendor_assignments where order_id=new.id) then return new; end if;
 select default_vendor_id into default_vendor from private.vendor_assignment_settings where singleton=true for share;
 if default_vendor is null then return new; end if;
 select role into target_role from public.profiles where id=default_vendor for share;
 -- A stale configuration leaves the paid order unassigned instead of failing payment processing.
 if target_role='vendor' then perform private.assign_vendor_to_order(new.id,default_vendor,null,'default'); end if;
 return new;
end $$;
revoke all on function private.auto_assign_paid_vendor() from public,anon,authenticated;
create trigger vendor_assignment_on_paid after update of payment_status on public.orders
 for each row execute function private.auto_assign_paid_vendor();

-- Backfill only orders whose every historical job points to one account that is currently a vendor.
-- Ambiguous, unassigned, and still-perfumer records deliberately remain unassigned for admin review.
insert into public.order_vendor_assignments(order_id,vendor_id,assigned_by,assignment_source,vendor_fee_amount,vendor_fee_snapshot)
select candidate.order_id,candidate.vendor_id,null,'backfill',(fee.snapshot->>'total_fee')::bigint,fee.snapshot
from (
 select i.order_id,max(j.assigned_to::text)::uuid vendor_id
 from public.order_items i join public.production_jobs j on j.order_item_id=i.id
 join public.profiles p on p.id=j.assigned_to and p.role='vendor'
 join public.orders o on o.id=i.order_id and o.payment_status='paid'
 group by i.order_id
 having count(*)=(select count(*) from public.order_items all_items where all_items.order_id=i.order_id)
    and count(distinct j.assigned_to)=1
) candidate
cross join lateral (select private.vendor_fee_snapshot(candidate.order_id) as snapshot) fee
on conflict(order_id) do nothing;
update public.production_jobs j set vendor_id=a.vendor_id from public.order_vendor_assignments a
join public.order_items i on i.order_id=a.order_id where j.order_item_id=i.id and j.vendor_id is null;
update public.shipments s set vendor_id=a.vendor_id from public.order_vendor_assignments a
where s.order_id=a.order_id and s.vendor_id is null;

-- Covers late server imports of an item/shipment after an already-paid, already-assigned order.
create or replace function private.sync_vendor_assignment_projection() returns trigger
language plpgsql security definer set search_path='' as $$
declare target_order uuid; target_vendor uuid;
begin
 if tg_table_name='production_jobs' then
  select i.order_id into target_order from public.order_items i where i.id=new.order_item_id;
 else
  target_order:=new.order_id;
 end if;
 select vendor_id into target_vendor from public.order_vendor_assignments where order_id=target_order;
 if target_vendor is null then return new; end if;
 if tg_table_name='production_jobs' and new.vendor_id is null then
  update public.production_jobs set vendor_id=target_vendor where id=new.id and vendor_id is null;
 elsif tg_table_name='shipments' and new.vendor_id is null then
  update public.shipments set vendor_id=target_vendor where id=new.id and vendor_id is null;
 end if;
 return new;
end $$;
revoke all on function private.sync_vendor_assignment_projection() from public,anon,authenticated;
create trigger vendor_assignment_on_production_insert after insert on public.production_jobs
 for each row execute function private.sync_vendor_assignment_projection();
create trigger vendor_assignment_on_shipment_insert after insert on public.shipments
 for each row execute function private.sync_vendor_assignment_projection();

-- Vendors can only read their own projections. Perfumer access is retained only for the vendor-unassigned compatibility queue.
drop policy if exists production_staff_read on public.production_jobs;
create policy production_staff_read on public.production_jobs for select to authenticated using (
 (select exists(select 1 from public.profiles where id=(select auth.uid()) and role='admin'))
 or (vendor_id=(select auth.uid()) and (select exists(select 1 from public.profiles where id=(select auth.uid()) and role='vendor')))
 or (vendor_id is null and (select exists(select 1 from public.profiles where id=(select auth.uid()) and role='perfumer')))
);
drop policy if exists shipments_read on public.shipments;
create policy shipments_read on public.shipments for select to authenticated using (
 exists(select 1 from public.orders o where o.id=order_id and o.user_id=(select auth.uid()))
 or (select exists(select 1 from public.profiles where id=(select auth.uid()) and role='admin'))
 or (vendor_id=(select auth.uid()) and (select exists(select 1 from public.profiles where id=(select auth.uid()) and role='vendor')))
);

create or replace function private.advance_production_job(p_job_id uuid,p_action text) returns public.production_jobs
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); actor_role public.app_role; parent_id uuid; parent public.orders; job public.production_jobs;
begin
 select role into actor_role from public.profiles where id=actor;
 if actor is null or actor_role not in ('vendor','perfumer') then raise exception 'Vendor or perfumer access required' using errcode='42501'; end if;
 if p_action is null or p_action not in ('start','complete') then raise exception 'Invalid production action' using errcode='22023'; end if;
 select i.order_id into parent_id from public.production_jobs j join public.order_items i on i.id=j.order_item_id where j.id=p_job_id;
 if parent_id is null then raise exception 'Production job not found' using errcode='P0002'; end if;
 select * into parent from public.orders where id=parent_id for update;
 select * into job from public.production_jobs where id=p_job_id for update;
 if actor_role='vendor' and job.vendor_id is distinct from actor then raise exception 'Assigned vendor access required' using errcode='42501'; end if;
 if actor_role='perfumer' and job.vendor_id is not null then raise exception 'Vendor-assigned work is not available to perfumers' using errcode='42501'; end if;
 if parent.payment_status<>'paid' then raise exception 'This job is on hold and cannot proceed' using errcode='23514'; end if;
 if p_action='start' then
  if job.status<>'queued' then
   if job.assigned_to=actor then return job; end if;
   raise exception 'This job has already been assigned' using errcode='23514';
  end if;
  update public.production_jobs set status='in_production',assigned_to=actor,started_at=clock_timestamp() where id=p_job_id returning * into job;
 else
  if job.assigned_to is distinct from actor then raise exception 'Only the assigned operator can complete this job' using errcode='42501'; end if;
  if job.status='completed' then return job; end if;
  if job.status<>'in_production' then raise exception 'Start production first' using errcode='23514'; end if;
  update public.production_jobs set status='completed',completed_at=clock_timestamp() where id=p_job_id returning * into job;
 end if;
 return job;
end $$;

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
 if p_action='save' and row(shipment.courier,shipment.service,shipment.tracking_number)=row(p_courier,p_service,p_tracking_number) then return shipment; end if;
 update public.shipments set courier=p_courier,service=p_service,tracking_number=p_tracking_number,
  status=case when p_action='ship' then 'shipped' else status end,
  shipped_at=case when p_action='ship' then clock_timestamp() else shipped_at end
  where id=p_shipment_id returning * into shipment;
 if p_action='ship' then update public.orders set status='shipped' where id=parent_id and status<>'shipped'; end if;
 return shipment;
end $$;
