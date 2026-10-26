-- TEST runs are not orders, payments, production jobs, shipments or payouts.
-- Their only side effects are writes to private.test_runs.
alter table private.admin_testing_preflight_settings
 add column mode_enabled boolean not null default false;

create table private.test_runs (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null unique,
 created_by uuid not null references public.profiles(id),
 vendor_id uuid not null references public.profiles(id),
 customer_name text not null,
 volume_ml integer not null check (volume_ml in (10,30)),
 bottle_count integer not null check (bottle_count in (1,3)),
 quantity integer not null check (quantity between 1 and 99),
 formulas jsonb not null check (jsonb_typeof(formulas)='array'),
 status text not null default 'order' check (status in ('order','production','packing','shipping','done','cancelled')),
 shipping jsonb,
 events jsonb not null default '[]'::jsonb check (jsonb_typeof(events)='array'),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 check (bottle_count=1 or volume_ml=10)
);
alter table private.test_runs enable row level security;
revoke all on private.test_runs from public, anon, authenticated;
grant select,insert,update on private.test_runs to service_role;
create index test_runs_vendor_created_idx on private.test_runs(vendor_id,created_at desc,id);

-- The lock makes disabling the feature serialize against in-flight actions.
create function private.require_test_mode() returns void
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from private.admin_testing_preflight_settings where singleton and mode_enabled for share;
 if not found then raise exception 'TEST mode is disabled' using errcode='42501'; end if;
end $$;
revoke all on function private.require_test_mode() from public,anon,authenticated;

create function private.test_mode_status() returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role in ('admin','vendor')) then
  raise exception 'Workspace access required' using errcode='42501';
 end if;
 return coalesce((select mode_enabled from private.admin_testing_preflight_settings where singleton),false);
end $$;
revoke all on function private.test_mode_status() from public,anon,authenticated;
grant execute on function private.test_mode_status() to authenticated;
create function public.test_mode_status() returns boolean language sql security invoker set search_path='' as $$ select private.test_mode_status(); $$;
revoke all on function public.test_mode_status() from public,anon,authenticated;
grant execute on function public.test_mode_status() to authenticated;

create function private.list_test_runs() returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); actor_role public.app_role;
begin
 select role into actor_role from public.profiles where id=actor;
 if actor is null or actor_role not in ('admin','vendor') then raise exception 'Workspace access required' using errcode='42501'; end if;
 perform private.require_test_mode();
 return coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc,r.id) from (
  select id,vendor_id,customer_name,volume_ml,bottle_count,quantity,formulas,status,shipping,events,created_at,updated_at
  from private.test_runs where actor_role='admin' or vendor_id=actor order by created_at desc,id limit 100
 ) r),'[]'::jsonb);
end $$;
revoke all on function private.list_test_runs() from public,anon,authenticated;
grant execute on function private.list_test_runs() to authenticated;
create function public.list_test_runs() returns jsonb language sql security invoker set search_path='' as $$ select private.list_test_runs(); $$;
revoke all on function public.list_test_runs() from public,anon,authenticated;
grant execute on function public.list_test_runs() to authenticated;

create function private.create_test_run(p_request_id uuid,p_vendor_id uuid,p_customer_name text,p_volume_ml integer,p_bottle_count integer,p_quantity integer,p_formulas jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item jsonb; phase text; row_data private.test_runs;
begin
 perform private.require_admin();
 perform private.require_test_mode();
 if p_request_id is null or p_vendor_id is null or length(btrim(coalesce(p_customer_name,''))) not between 1 and 80
  or p_customer_name ~ '[[:cntrl:]]' or p_volume_ml not in (10,30) or p_bottle_count not in (1,3)
  or p_volume_ml is null or p_bottle_count is null or (p_bottle_count=3 and p_volume_ml<>10)
  or p_quantity is null or p_quantity not between 1 and 99 then raise exception 'Invalid TEST order' using errcode='22023'; end if;
 if jsonb_typeof(p_formulas) is distinct from 'array' or jsonb_array_length(p_formulas)<>p_bottle_count then raise exception 'Invalid TEST formulas' using errcode='22023'; end if;
 for item in select value from jsonb_array_elements(p_formulas) loop
  if jsonb_typeof(item) is distinct from 'object' or (select count(*) from jsonb_object_keys(item))<>3 then raise exception 'Invalid TEST formula' using errcode='22023'; end if;
  foreach phase in array array['top','middle','base'] loop
   if jsonb_typeof(item->phase) is distinct from 'string' or length(btrim(item->>phase)) not between 1 and 80 or (item->>phase) ~ '[[:cntrl:]]'
    then raise exception 'Invalid TEST note' using errcode='22023'; end if;
  end loop;
 end loop;
 if not exists(select 1 from public.profiles where id=p_vendor_id and role='vendor') then raise exception 'Assigned account must be a vendor' using errcode='23514'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 select * into row_data from private.test_runs where request_id=p_request_id;
 if found then
  if row_data.created_by<>actor or row(row_data.vendor_id,row_data.customer_name,row_data.volume_ml,row_data.bottle_count,row_data.quantity,row_data.formulas)
   is distinct from row(p_vendor_id,btrim(p_customer_name),p_volume_ml,p_bottle_count,p_quantity,p_formulas) then
   raise exception 'TEST request ID already used' using errcode='23514';
  end if;
  return to_jsonb(row_data)-'request_id';
 end if;
 insert into private.test_runs(request_id,created_by,vendor_id,customer_name,volume_ml,bottle_count,quantity,formulas,events)
 values(p_request_id,actor,p_vendor_id,btrim(p_customer_name),p_volume_ml,p_bottle_count,p_quantity,p_formulas,
  jsonb_build_array(jsonb_build_object('action','created','actor',actor,'at',clock_timestamp(),'request_id',p_request_id)))
 returning * into row_data;
 return to_jsonb(row_data)-'request_id';
end $$;
revoke all on function private.create_test_run(uuid,uuid,text,integer,integer,integer,jsonb) from public,anon,authenticated;
grant execute on function private.create_test_run(uuid,uuid,text,integer,integer,integer,jsonb) to authenticated;
create function public.create_test_run(p_request_id uuid,p_vendor_id uuid,p_customer_name text,p_volume_ml integer,p_bottle_count integer,p_quantity integer,p_formulas jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.create_test_run(p_request_id,p_vendor_id,p_customer_name,p_volume_ml,p_bottle_count,p_quantity,p_formulas); $$;
revoke all on function public.create_test_run(uuid,uuid,text,integer,integer,integer,jsonb) from public,anon,authenticated;
grant execute on function public.create_test_run(uuid,uuid,text,integer,integer,integer,jsonb) to authenticated;

create function private.advance_test_run(p_run_id uuid,p_request_id uuid,p_action text,p_payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); actor_role public.app_role; run private.test_runs; target text; event jsonb; field text;
begin
 select role into actor_role from public.profiles where id=actor;
 if actor is null or actor_role not in ('admin','vendor') then raise exception 'Workspace access required' using errcode='42501'; end if;
 perform private.require_test_mode();
 if p_request_id is null or p_run_id is null or p_action is null or p_action not in ('start','complete','pack','ship','cancel') or jsonb_typeof(p_payload) is distinct from 'object'
  then raise exception 'Invalid TEST action' using errcode='22023'; end if;
 if (p_action='cancel' and actor_role is distinct from 'admin') or (p_action<>'cancel' and actor_role is distinct from 'vendor')
  then raise exception 'Action not permitted for this role' using errcode='42501'; end if;
 select * into run from private.test_runs where id=p_run_id and (actor_role='admin' or vendor_id=actor) for update;
 if not found then raise exception 'Assigned TEST run not found' using errcode='42501'; end if;
 select value into event from jsonb_array_elements(run.events) where value->>'request_id'=p_request_id::text limit 1;
 if found then
  if event->>'actor'<>actor::text or event->>'action'<>p_action or event->'payload' is distinct from p_payload then
   raise exception 'TEST request ID already used' using errcode='23514';
  end if;
  return to_jsonb(run)-'request_id';
 end if;
 target:=case p_action when 'start' then 'production' when 'complete' then 'packing' when 'pack' then 'shipping' when 'ship' then 'done' else 'cancelled' end;
 if (p_action='cancel' and run.status not in ('order','production','packing','shipping'))
  or (p_action<>'cancel' and run.status is distinct from (case p_action when 'start' then 'order' when 'complete' then 'production' when 'pack' then 'packing' else 'shipping' end))
  then raise exception 'Invalid TEST status transition' using errcode='23514'; end if;
 if p_action='pack' and p_payload is distinct from '{"confirmed":true}'::jsonb then raise exception 'Explicit TEST packing confirmation required' using errcode='23514'; end if;
 if p_action='ship' then
  if (select count(*) from jsonb_object_keys(p_payload))<>4 or not (p_payload ?& array['courier','service','tracking','cost'])
   then raise exception 'TEST shipping fields required' using errcode='23514'; end if;
  foreach field in array array['courier','service','tracking'] loop
   if jsonb_typeof(p_payload->field) is distinct from 'string' or length(btrim(p_payload->>field)) not between 1 and 100 or (p_payload->>field) ~ '[[:cntrl:]]'
    then raise exception 'Invalid TEST shipping details' using errcode='23514'; end if;
  end loop;
  if jsonb_typeof(p_payload->'cost') is distinct from 'number' or (p_payload->>'cost') !~ '^[0-9]{1,12}$' then raise exception 'Invalid TEST shipping cost' using errcode='23514'; end if;
 elsif p_action in ('start','complete','cancel') and p_payload is distinct from '{}'::jsonb then
  raise exception 'Unexpected TEST action details' using errcode='22023';
 end if;
 update private.test_runs set status=target,shipping=case when p_action='ship' then p_payload else shipping end,
  updated_at=clock_timestamp(),events=events||jsonb_build_array(jsonb_build_object('action',p_action,'actor',actor,'at',clock_timestamp(),'request_id',p_request_id,'payload',p_payload))
 where id=run.id returning * into run;
 return to_jsonb(run)-'request_id';
end $$;
revoke all on function private.advance_test_run(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.advance_test_run(uuid,uuid,text,jsonb) to authenticated;
create function public.advance_test_run(p_run_id uuid,p_request_id uuid,p_action text,p_payload jsonb default '{}'::jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.advance_test_run(p_run_id,p_request_id,p_action,p_payload); $$;
revoke all on function public.advance_test_run(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.advance_test_run(uuid,uuid,text,jsonb) to authenticated;
