-- Synthetic fixtures in the disposable CI database only; everything rolls back.
begin;
insert into auth.users(id,email) values
 ('f1000000-0000-4000-8000-000000000001','preflight-admin@example.invalid'),
 ('f1000000-0000-4000-8000-000000000002','preflight-customer@example.invalid'),
 ('f1000000-0000-4000-8000-000000000003','preflight-vendor@example.invalid');
update public.profiles set role='admin' where id='f1000000-0000-4000-8000-000000000001';
update public.profiles set role='vendor' where id='f1000000-0000-4000-8000-000000000003';
insert into public.orders(id,order_number,user_id,request_id,request_payload,address_snapshot,subtotal,discount,shipping,grand_total,status,payment_status) values
 ('f2000000-0000-4000-8000-000000000001','PREFLIGHT-EMPTY','f1000000-0000-4000-8000-000000000002',gen_random_uuid(),'{}','{}',100,0,0,100,'pending_payment','pending'),
 ('f2000000-0000-4000-8000-000000000002','PREFLIGHT-ELIGIBLE','f1000000-0000-4000-8000-000000000002',gen_random_uuid(),'{}','{}',100,0,0,100,'pending_payment','pending'),
 ('f2000000-0000-4000-8000-000000000003','PREFLIGHT-PENDING','f1000000-0000-4000-8000-000000000002',gen_random_uuid(),'{}','{}',100,0,0,100,'pending_payment','pending'),
 ('f2000000-0000-4000-8000-000000000004','PREFLIGHT-EXPIRED','f1000000-0000-4000-8000-000000000002',gen_random_uuid(),'{}','{}',100,0,0,100,'pending_payment','pending'),
 ('f2000000-0000-4000-8000-000000000005','PREFLIGHT-PAID','f1000000-0000-4000-8000-000000000002',gen_random_uuid(),'{}','{}',100,0,0,100,'paid','paid');
insert into public.order_items(order_id,position,product_snapshot,creations_snapshot,quantity,normal_unit_price,unit_price,line_total) values
 ('f2000000-0000-4000-8000-000000000002',1,'{"label":"Synthetic 10 ml","volume_ml":10,"bottle_count":1}','[]',1,100,100,100),
 ('f2000000-0000-4000-8000-000000000003',1,'{"label":"Synthetic 10 ml","volume_ml":10,"bottle_count":1}','[]',1,100,100,100),
 ('f2000000-0000-4000-8000-000000000004',1,'{"label":"Synthetic 10 ml","volume_ml":10,"bottle_count":1}','[]',1,100,100,100);
insert into public.payments(order_id,provider,environment,provider_reference,amount,status,request_payload) values
 ('f2000000-0000-4000-8000-000000000003','doku','sandbox','PREFLIGHT-ACTIVE',100,'pending','{}'),
 ('f2000000-0000-4000-8000-000000000004','doku','sandbox','PREFLIGHT-EXPIRED',100,'expired','{}');
create temp table preflight_before as select
 (select jsonb_agg(to_jsonb(o) order by id) from public.orders o where order_number like 'PREFLIGHT-%') orders,
 (select jsonb_agg(to_jsonb(p) order by id) from public.payments p where provider_reference like 'PREFLIGHT-%') payments,
 (select count(*) from public.production_jobs) jobs,
 (select count(*) from public.shipments) shipments,
 (select count(*) from public.order_vendor_assignments) assignments,
 (select count(*) from public.vendor_payout_items) payout_items;

set local role authenticated;
do $$ declare uid uuid; begin
 foreach uid in array array['f1000000-0000-4000-8000-000000000002'::uuid,'f1000000-0000-4000-8000-000000000003'::uuid] loop
  perform set_config('request.jwt.claim.sub',uid::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'user_metadata',jsonb_build_object('role','admin'))::text,true);
  begin perform public.admin_testing_preflight('f2000000-0000-4000-8000-000000000002'); raise exception 'Non-admin accepted'; exception when insufficient_privilege then null; end;
 end loop;
 begin update private.admin_testing_preflight_settings set enabled=true; raise exception 'Client changed server setting'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true);
do $$ declare r jsonb; begin
 r:=public.admin_testing_preflight('f2000000-0000-4000-8000-000000000002');
 if r->>'reason'<>'disabled' or (r->>'workflow_available')::boolean then raise exception 'Preflight must default off'; end if;
end $$;
reset role;
set local role service_role;
update private.admin_testing_preflight_settings set enabled=true where singleton;
reset role;
set local role authenticated;
do $$ declare r jsonb; begin
 r:=public.admin_testing_preflight('f2000000-0000-4000-8000-000000000002');
 if r->>'reason'<>'candidate_only' or not (r->>'candidate')::boolean or (r->>'workflow_available')::boolean then raise exception 'Candidate check incorrect'; end if;
 if public.admin_testing_preflight('f2000000-0000-4000-8000-000000000002')<>r then raise exception 'Repeated check changed result'; end if;
 if public.admin_testing_preflight('f2000000-0000-4000-8000-000000000001')->>'reason'<>'no_items' then raise exception 'Empty order accepted'; end if;
 if public.admin_testing_preflight('f2000000-0000-4000-8000-000000000003')->>'reason'<>'payment_history' then raise exception 'Active payment accepted'; end if;
 if public.admin_testing_preflight('f2000000-0000-4000-8000-000000000004')->>'reason'<>'payment_history' then raise exception 'Expired payment accepted'; end if;
 if public.admin_testing_preflight('f2000000-0000-4000-8000-000000000005')->>'reason'<>'not_pending' then raise exception 'Paid order accepted'; end if;
 if public.admin_testing_preflight('f2000000-0000-4000-8000-000000000099')->>'reason'<>'not_found' then raise exception 'Missing order accepted'; end if;
end $$;
set local role anon;
do $$ begin
 begin perform public.admin_testing_preflight('f2000000-0000-4000-8000-000000000002'); raise exception 'Anonymous accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ declare b record; begin
 select * into b from preflight_before;
 if b.orders is distinct from (select jsonb_agg(to_jsonb(o) order by id) from public.orders o where order_number like 'PREFLIGHT-%')
  or b.payments is distinct from (select jsonb_agg(to_jsonb(p) order by id) from public.payments p where provider_reference like 'PREFLIGHT-%')
  or b.jobs<>(select count(*) from public.production_jobs)
  or b.shipments<>(select count(*) from public.shipments)
  or b.assignments<>(select count(*) from public.order_vendor_assignments)
  or b.payout_items<>(select count(*) from public.vendor_payout_items) then
  raise exception 'Preflight mutated production or financial records';
 end if;
end $$;
rollback;
select 'PASS: disabled-by-default, admin-only, conservative and non-mutating preflight' result;
