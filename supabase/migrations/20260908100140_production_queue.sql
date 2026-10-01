-- Production contains only operational projections of immutable order-item snapshots.
create table public.production_jobs (
 id uuid primary key default gen_random_uuid(),
 order_item_id uuid not null unique references public.order_items(id),
 status text not null default 'queued' check(status in ('queued','in_production','completed')),
 assigned_to uuid references public.profiles(id),
 started_at timestamptz, completed_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 order_number text not null, ordered_at timestamptz not null,
 product_snapshot jsonb not null, formulas_snapshot jsonb not null,
 quantity integer not null check(quantity between 1 and 99),
 production_allowed boolean not null default true,
 check ((status='queued' and assigned_to is null and started_at is null and completed_at is null)
     or (status='in_production' and assigned_to is not null and started_at is not null and completed_at is null)
     or (status='completed' and assigned_to is not null and started_at is not null and completed_at is not null and completed_at>=started_at))
);
create index production_jobs_queue_idx on public.production_jobs(status,ordered_at,id);
create index production_jobs_assignee_idx on public.production_jobs(assigned_to) where assigned_to is not null;
alter table public.production_jobs enable row level security;
revoke all on public.production_jobs from public,anon,authenticated;
grant select on public.production_jobs to authenticated;
grant all on public.production_jobs to service_role;
create policy production_staff_read on public.production_jobs for select to authenticated
 using ((select exists(select 1 from public.profiles where id=auth.uid() and role in ('perfumer','admin'))));

-- Trigger-only privileged lookup: no customer gets SELECT on the source order/items.
create function private.prepare_production_job() returns trigger
language plpgsql security definer set search_path='' as $$
declare item public.order_items; parent public.orders;
begin
 if tg_op='UPDATE' then
  if row(new.id,new.order_item_id,new.order_number,new.ordered_at,new.product_snapshot,new.formulas_snapshot,new.quantity,new.created_at)
   is distinct from row(old.id,old.order_item_id,old.order_number,old.ordered_at,old.product_snapshot,old.formulas_snapshot,old.quantity,old.created_at) then
   raise exception 'Production snapshot is immutable' using errcode='23514';
  end if;
  new.updated_at:=clock_timestamp(); return new;
 end if;
 select * into item from public.order_items where id=new.order_item_id;
 select * into parent from public.orders where id=item.order_id for update;
 if parent.id is null or parent.payment_status<>'paid' then
  raise exception 'Only paid orders can enter production' using errcode='23514';
 end if;
 new.status:='queued'; new.assigned_to:=null; new.started_at:=null; new.completed_at:=null;
 new.order_number:=parent.order_number; new.ordered_at:=parent.created_at;
 new.quantity:=item.quantity; new.production_allowed:=true;
 new.product_snapshot:=jsonb_build_object('label',item.product_snapshot->>'label',
   'volume_ml',item.product_snapshot->'volume_ml','bottle_count',item.product_snapshot->'bottle_count');
 -- Whitelist note names only. Never copy creation IDs, customer identity, prices or arbitrary JSON keys.
 select coalesce(jsonb_agg(jsonb_build_object(
   'top',(select n->'note'->>'name' from jsonb_array_elements(blend->'notes') n where n->>'phase'='top' limit 1),
   'middle',(select n->'note'->>'name' from jsonb_array_elements(blend->'notes') n where n->>'phase'='middle' limit 1),
   'base',(select n->'note'->>'name' from jsonb_array_elements(blend->'notes') n where n->>'phase'='base' limit 1)
 ) order by position),'[]'::jsonb) into new.formulas_snapshot
 from jsonb_array_elements(item.creations_snapshot) with ordinality as b(blend,position);
 return new;
end $$;
revoke all on function private.prepare_production_job() from public,anon,authenticated;
create trigger production_job_snapshot before insert or update on public.production_jobs
 for each row execute function private.prepare_production_job();

create function private.enqueue_paid_production() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='orders' then
  if new.payment_status='paid' then
   insert into public.production_jobs(order_item_id)
    select id from public.order_items where order_id=new.id order by position
    on conflict(order_item_id) do nothing;
  end if;
  update public.production_jobs j set production_allowed=(new.payment_status='paid')
   from public.order_items i where i.id=j.order_item_id and i.order_id=new.id
   and j.production_allowed is distinct from (new.payment_status='paid');
 else
  -- Covers server imports inserting an item after its paid parent; normal checkout stays unpaid.
  perform 1 from public.orders where id=new.order_id and payment_status='paid' for update;
  if found then
   insert into public.production_jobs(order_item_id) values(new.id) on conflict(order_item_id) do nothing;
  end if;
 end if;
 return new;
end $$;
revoke all on function private.enqueue_paid_production() from public,anon,authenticated;
create trigger production_on_payment after update of payment_status on public.orders
 for each row execute function private.enqueue_paid_production();
create trigger production_on_item after insert on public.order_items
 for each row execute function private.enqueue_paid_production();

-- Safe backfill; replaying payment events and backfill cannot reset existing jobs.
insert into public.production_jobs(order_item_id)
 select i.id from public.order_items i join public.orders o on o.id=i.order_id
 where o.payment_status='paid' order by o.created_at,i.position
 on conflict(order_item_id) do nothing;

-- Private privileged implementation is necessary to check paid eligibility without exposing orders.
create function private.advance_production_job(p_job_id uuid,p_action text) returns public.production_jobs
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); parent_id uuid; parent public.orders; job public.production_jobs;
begin
 if actor is null or not exists(select 1 from public.profiles where id=actor and role='perfumer') then
  raise exception 'Perfumer access required' using errcode='42501';
 end if;
 if p_action is null or p_action not in ('start','complete') then raise exception 'Invalid production action' using errcode='22023'; end if;
 select i.order_id into parent_id from public.production_jobs j join public.order_items i on i.id=j.order_item_id where j.id=p_job_id;
 if parent_id is null then raise exception 'Production job not found' using errcode='P0002'; end if;
 -- Lock in the same order as payment processing: order, then job. Concurrent claims serialize.
 select * into parent from public.orders where id=parent_id for update;
 select * into job from public.production_jobs where id=p_job_id for update;
 if parent.payment_status<>'paid' then raise exception 'This job is on hold and cannot proceed' using errcode='23514'; end if;
 if p_action='start' then
  if job.status<>'queued' then
   if job.assigned_to=actor then return job; end if;
   raise exception 'This job has already been assigned' using errcode='23514';
  end if;
  update public.production_jobs set status='in_production',assigned_to=actor,started_at=clock_timestamp()
   where id=p_job_id returning * into job;
 else
  if job.assigned_to is distinct from actor then raise exception 'Only the assigned perfumer can complete this job' using errcode='42501'; end if;
  if job.status='completed' then return job; end if;
  if job.status<>'in_production' then raise exception 'Start production first' using errcode='23514'; end if;
  update public.production_jobs set status='completed',completed_at=clock_timestamp()
   where id=p_job_id returning * into job;
 end if;
 return job;
end $$;
revoke all on function private.advance_production_job(uuid,text) from public,anon,authenticated;
grant usage on schema private to authenticated;
grant execute on function private.advance_production_job(uuid,text) to authenticated;
create function public.advance_production_job(p_job_id uuid,p_action text) returns public.production_jobs
language sql security invoker set search_path='' as $$ select private.advance_production_job(p_job_id,p_action); $$;
revoke all on function public.advance_production_job(uuid,text) from public,anon,authenticated;
grant execute on function public.advance_production_job(uuid,text) to authenticated;
