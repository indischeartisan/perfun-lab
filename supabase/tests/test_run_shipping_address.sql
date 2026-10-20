begin;
insert into auth.users(id,email) values
 ('f9000000-0000-4000-8000-000000000001','address-admin@example.invalid'),
 ('f9000000-0000-4000-8000-000000000002','address-vendor@example.invalid'),
 ('f9000000-0000-4000-8000-000000000003','address-other@example.invalid');
update public.profiles set role='admin' where id='f9000000-0000-4000-8000-000000000001';
update public.profiles set role='vendor' where id in ('f9000000-0000-4000-8000-000000000002','f9000000-0000-4000-8000-000000000003');
update private.admin_testing_preflight_settings set mode_enabled=true where singleton;
set local role authenticated;
select set_config('request.jwt.claim.sub','f9000000-0000-4000-8000-000000000001',true);
do $$ declare a jsonb:='{"recipient":"TEST Recipient","phone":"0000000000","province":"Fictional","city":"Fictional","district":"Fictional","postal_code":"00000","address":"TEST street","detail":""}'; r jsonb; retry jsonb; begin
 r:=public.create_test_run_with_address('fa000000-0000-4000-8000-000000000001','f9000000-0000-4000-8000-000000000002','Fictional',10,1,1,'[{"top":"A","middle":"B","base":"C"}]',a);
 retry:=public.create_test_run_with_address('fa000000-0000-4000-8000-000000000001','f9000000-0000-4000-8000-000000000002','Fictional',10,1,1,'[{"top":"A","middle":"B","base":"C"}]',a);
 if r->'test_address' is distinct from a or retry->>'id'<>r->>'id' then raise exception 'TEST address or retry failed'; end if;
 begin perform public.create_test_run_with_address('fa000000-0000-4000-8000-000000000001','f9000000-0000-4000-8000-000000000002','Fictional',10,1,1,'[{"top":"A","middle":"B","base":"C"}]',jsonb_set(a,'{city}','"Different"')); raise exception 'Changed address accepted'; exception when check_violation then null; end;
 perform set_config('test.address_run',r->>'id',true);
 r:=public.create_test_run(gen_random_uuid(),'f9000000-0000-4000-8000-000000000002','Legacy',10,1,1,'[{"top":"A","middle":"B","base":"C"}]');
 perform set_config('test.legacy_run',r->>'id',true);
end $$;
select set_config('request.jwt.claim.sub','f9000000-0000-4000-8000-000000000003',true);
do $$ begin if jsonb_array_length(public.list_test_runs())<>0 then raise exception 'Other vendor sees TEST address'; end if; end $$;
select set_config('request.jwt.claim.sub','f9000000-0000-4000-8000-000000000002',true);
do $$ declare runs jsonb:=public.list_test_runs(); begin
 if not exists(select 1 from jsonb_array_elements(runs) item where item->>'id'=current_setting('test.address_run') and item->'test_address'->>'recipient'='TEST Recipient') then raise exception 'Assigned vendor missing TEST address'; end if;
 if not exists(select 1 from jsonb_array_elements(runs) item where item->>'id'=current_setting('test.legacy_run') and item->'test_address'='null'::jsonb) then raise exception 'Legacy TEST missing null address'; end if;
 begin perform public.create_test_run_with_address(gen_random_uuid(),'f9000000-0000-4000-8000-000000000002','Fictional',10,1,1,'[{"top":"A","middle":"B","base":"C"}]','{}'); raise exception 'Vendor created TEST'; exception when insufficient_privilege then null; end;
end $$;
rollback;
select 'PASS: TEST address isolation, legacy and idempotency' result;
