begin;
insert into auth.users(id,email) values
 ('f3000000-0000-4000-8000-000000000001','test-run-admin@example.invalid'),
 ('f3000000-0000-4000-8000-000000000002','test-run-vendor@example.invalid'),
 ('f3000000-0000-4000-8000-000000000003','test-run-other@example.invalid'),
 ('f3000000-0000-4000-8000-000000000004','test-run-customer@example.invalid');
update public.profiles set role='admin' where id='f3000000-0000-4000-8000-000000000001';
update public.profiles set role='vendor' where id in ('f3000000-0000-4000-8000-000000000002','f3000000-0000-4000-8000-000000000003');
create temp table test_before as select
 (select coalesce(jsonb_agg(to_jsonb(o) order by id),'[]'::jsonb) from public.orders o) orders,
 (select coalesce(jsonb_agg(to_jsonb(p) order by id),'[]'::jsonb) from public.payments p) payments,
 (select coalesce(jsonb_agg(to_jsonb(j) order by id),'[]'::jsonb) from public.production_jobs j) jobs,
 (select coalesce(jsonb_agg(to_jsonb(s) order by id),'[]'::jsonb) from public.shipments s) shipments,
 (select coalesce(jsonb_agg(to_jsonb(a) order by order_id),'[]'::jsonb) from public.order_vendor_assignments a) assignments,
 (select coalesce(jsonb_agg(to_jsonb(p) order by id),'[]'::jsonb) from public.vendor_payout_items p) payouts,
 (select coalesce(jsonb_agg(to_jsonb(p) order by id),'[]'::jsonb) from public.vendor_payouts p) payout_batches;
set local role authenticated;
select set_config('request.jwt.claim.sub','f3000000-0000-4000-8000-000000000001',true);
do $$ begin
 if public.test_mode_status() then raise exception 'TEST mode must default off'; end if;
 begin perform public.list_test_runs(); raise exception 'Disabled list accepted'; exception when insufficient_privilege then null; end;
 begin perform public.create_test_run('f4000000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000002','Fictional',10,1,1,'[{"top":"Yuzu","middle":"Matcha","base":"Vanilla"}]'); raise exception 'Disabled create accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
update private.admin_testing_preflight_settings set mode_enabled=true where singleton;
set local role authenticated;
do $$ declare run jsonb; same jsonb; begin
 run:=public.create_test_run('f4000000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000002','Fictional',10,3,1,'[{"top":"A","middle":"B","base":"C"},{"top":"D","middle":"E","base":"F"},{"top":"G","middle":"H","base":"I"}]');
 perform set_config('test.run_id',run->>'id',true);
 same:=public.create_test_run('f4000000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000002','Fictional',10,3,1,'[{"top":"A","middle":"B","base":"C"},{"top":"D","middle":"E","base":"F"},{"top":"G","middle":"H","base":"I"}]');
 if run->>'id'<>same->>'id' or jsonb_array_length(run->'formulas')<>3 then raise exception 'TEST creation idempotency or formulas failed'; end if;
 begin perform public.advance_test_run((run->>'id')::uuid,gen_random_uuid(),'start'); raise exception 'Admin started vendor TEST'; exception when insufficient_privilege then null; end;
 begin perform public.create_test_run('f4000000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000002','Changed',10,3,1,'[{"top":"A","middle":"B","base":"C"},{"top":"D","middle":"E","base":"F"},{"top":"G","middle":"H","base":"I"}]'); raise exception 'Different duplicate accepted'; exception when check_violation then null; end;
 same:=public.create_test_run('f4000000-0000-4000-8000-000000000002','f3000000-0000-4000-8000-000000000002','Cancelled',10,1,1,'[{"top":"A","middle":"B","base":"C"}]');
 same:=public.advance_test_run((same->>'id')::uuid,gen_random_uuid(),'cancel');
 if same->>'status'<>'cancelled' or same->'events'->1->>'actor'<>'f3000000-0000-4000-8000-000000000001' then raise exception 'Admin cancellation or audit failed'; end if;
end $$;
select set_config('request.jwt.claim.sub','f3000000-0000-4000-8000-000000000003',true);
do $$ begin
 if jsonb_array_length(public.list_test_runs())<>0 then raise exception 'Other vendor sees run'; end if;
 begin perform public.advance_test_run((select id from private.test_runs limit 1),gen_random_uuid(),'start'); raise exception 'Direct private table access allowed'; exception when insufficient_privilege then null; end;
 begin perform public.advance_test_run(current_setting('test.run_id')::uuid,gen_random_uuid(),'start'); raise exception 'Other vendor started run'; exception when insufficient_privilege then null; end;
 begin perform public.advance_test_run(current_setting('test.run_id')::uuid,gen_random_uuid(),'cancel'); raise exception 'Vendor cancelled run'; exception when insufficient_privilege then null; end;
 begin perform public.create_test_run(gen_random_uuid(),'f3000000-0000-4000-8000-000000000002','Fictional',10,1,1,'[{"top":"A","middle":"B","base":"C"}]'); raise exception 'Vendor created TEST'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','f3000000-0000-4000-8000-000000000002',true);
do $$ declare id uuid; result jsonb; begin
 id:=current_setting('test.run_id')::uuid;
 if not exists(select 1 from jsonb_array_elements(public.list_test_runs()) item where item->>'id'=id::text) then raise exception 'Assigned vendor cannot see run'; end if;
 begin perform public.advance_test_run(id,gen_random_uuid(),'ship','{}'); raise exception 'Out of order ship accepted'; exception when check_violation then null; end;
 result:=public.advance_test_run(id,'f5000000-0000-4000-8000-000000000001','start');
 if result->>'status'<>'production' then raise exception 'Start failed'; end if;
 result:=public.advance_test_run(id,'f5000000-0000-4000-8000-000000000001','start');
 if jsonb_array_length(result->'events')<>2 then raise exception 'Duplicate start was applied'; end if;
 result:=public.advance_test_run(id,gen_random_uuid(),'complete');
 begin perform public.advance_test_run(id,gen_random_uuid(),'pack','{}'); raise exception 'Unconfirmed pack accepted'; exception when check_violation then null; end;
 result:=public.advance_test_run(id,gen_random_uuid(),'pack','{"confirmed":true}');
 begin perform public.advance_test_run(id,gen_random_uuid(),'ship','{}'); raise exception 'Invalid shipping accepted'; exception when check_violation then null; end;
 result:=public.advance_test_run(id,gen_random_uuid(),'ship','{"courier":"TEST","service":"TEST","tracking":"TEST","cost":0}');
 if result->>'status'<>'done' or jsonb_array_length(result->'events')<>5 then raise exception 'TEST workflow failed'; end if;
 if result->'events'->4->>'actor'<>'f3000000-0000-4000-8000-000000000002' or result->'events'->4->>'at' is null then raise exception 'TEST audit missing'; end if;
end $$;
select set_config('request.jwt.claim.sub','f3000000-0000-4000-8000-000000000004',true);
do $$ begin
 begin perform public.test_mode_status(); raise exception 'Customer access allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
update private.admin_testing_preflight_settings set mode_enabled=false where singleton;
set local role authenticated;
select set_config('request.jwt.claim.sub','f3000000-0000-4000-8000-000000000002',true);
do $$ begin
 begin perform public.advance_test_run(current_setting('test.run_id')::uuid,gen_random_uuid(),'start'); raise exception 'Disabled action accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ declare b record; begin
 select * into b from test_before;
 if b.orders is distinct from (select coalesce(jsonb_agg(to_jsonb(o) order by id),'[]'::jsonb) from public.orders o)
  or b.payments is distinct from (select coalesce(jsonb_agg(to_jsonb(p) order by id),'[]'::jsonb) from public.payments p)
  or b.jobs is distinct from (select coalesce(jsonb_agg(to_jsonb(j) order by id),'[]'::jsonb) from public.production_jobs j)
  or b.shipments is distinct from (select coalesce(jsonb_agg(to_jsonb(s) order by id),'[]'::jsonb) from public.shipments s)
  or b.assignments is distinct from (select coalesce(jsonb_agg(to_jsonb(a) order by order_id),'[]'::jsonb) from public.order_vendor_assignments a)
  or b.payouts is distinct from (select coalesce(jsonb_agg(to_jsonb(p) order by id),'[]'::jsonb) from public.vendor_payout_items p)
  or b.payout_batches is distinct from (select coalesce(jsonb_agg(to_jsonb(p) order by id),'[]'::jsonb) from public.vendor_payouts p)
  then raise exception 'TEST changed real data'; end if;
end $$;
rollback;
select 'PASS: TEST mode authorization, switch, isolated workflow, audit and idempotency' result;
