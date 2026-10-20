-- Fictional-only snapshot, stored exclusively with TEST records. Existing runs remain NULL.
alter table private.test_runs add column test_address jsonb;

create or replace function private.list_test_runs() returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); actor_role public.app_role;
begin
 select role into actor_role from public.profiles where id=actor;
 if actor is null or actor_role not in ('admin','vendor') then raise exception 'Workspace access required' using errcode='42501'; end if;
 perform private.require_test_mode();
 return coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc,r.id) from (
  select id,vendor_id,customer_name,volume_ml,bottle_count,quantity,formulas,status,shipping,test_address,events,created_at,updated_at
  from private.test_runs where actor_role='admin' or vendor_id=actor order by created_at desc,id limit 100
 ) r),'[]'::jsonb);
end $$;

-- Reuse the existing guarded, idempotent create and its transaction advisory lock.
create function private.create_test_run_with_address(p_request_id uuid,p_vendor_id uuid,p_customer_name text,p_volume_ml integer,p_bottle_count integer,p_quantity integer,p_formulas jsonb,p_address jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; old_address jsonb; field text;
begin
 perform private.require_admin();
 perform private.require_test_mode();
 if jsonb_typeof(p_address) is distinct from 'object' or
   not (p_address ?& array['recipient','phone','province','city','district','postal_code','address','detail']) or
   (select count(*) from jsonb_object_keys(p_address))<>8 then
  raise exception 'Invalid TEST address' using errcode='22023';
 end if;
 foreach field in array array['recipient','phone','province','city','district','postal_code','address','detail'] loop
  if jsonb_typeof(p_address->field) is distinct from 'string' or length(btrim(p_address->>field)) > 300
   or (field<>'detail' and length(btrim(p_address->>field))=0) or (p_address->>field) ~ '[[:cntrl:]]' then
   raise exception 'Invalid TEST address field' using errcode='22023';
  end if;
 end loop;
 if (p_address->>'postal_code') !~ '^[0-9]{5}$' then raise exception 'Invalid TEST postal code' using errcode='22023'; end if;
 result:=private.create_test_run(p_request_id,p_vendor_id,p_customer_name,p_volume_ml,p_bottle_count,p_quantity,p_formulas);
 select test_address into old_address from private.test_runs where id=(result->>'id')::uuid for update;
 if old_address is not null and old_address is distinct from p_address then
  raise exception 'TEST request ID already used with a different address' using errcode='23514';
 end if;
 if old_address is null then
  update private.test_runs set test_address=p_address where id=(result->>'id')::uuid returning to_jsonb(test_runs)-'request_id' into result;
 end if;
 return result;
end $$;
revoke all on function private.create_test_run_with_address(uuid,uuid,text,integer,integer,integer,jsonb,jsonb) from public,anon,authenticated;
grant execute on function private.create_test_run_with_address(uuid,uuid,text,integer,integer,integer,jsonb,jsonb) to authenticated;
create function public.create_test_run_with_address(p_request_id uuid,p_vendor_id uuid,p_customer_name text,p_volume_ml integer,p_bottle_count integer,p_quantity integer,p_formulas jsonb,p_address jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.create_test_run_with_address(p_request_id,p_vendor_id,p_customer_name,p_volume_ml,p_bottle_count,p_quantity,p_formulas,p_address); $$;
revoke all on function public.create_test_run_with_address(uuid,uuid,text,integer,integer,integer,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.create_test_run_with_address(uuid,uuid,text,integer,integer,integer,jsonb,jsonb) to authenticated;
