-- Disposable Vendor Workspace phase-2 fixtures. Run against a migrated disposable/local database only.
begin;
insert into auth.users(id,email) values
 ('b1000000-0000-4000-8000-000000000001','vendor-assignment-customer@example.invalid'),
 ('b1000000-0000-4000-8000-000000000002','vendor-assignment-admin@example.invalid'),
 ('b1000000-0000-4000-8000-000000000003','vendor-assignment-a@example.invalid'),
 ('b1000000-0000-4000-8000-000000000004','vendor-assignment-b@example.invalid'),
 ('b1000000-0000-4000-8000-000000000005','vendor-assignment-perfumer@example.invalid');
update public.profiles set role='admin' where id='b1000000-0000-4000-8000-000000000002';
update public.profiles set role='vendor' where id in ('b1000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-000000000004');
update public.profiles set role='perfumer' where id='b1000000-0000-4000-8000-000000000005';

insert into public.orders(id,order_number,user_id,request_id,request_payload,address_snapshot,subtotal,discount,shipping,grand_total)
values
 ('b2000000-0000-4000-8000-000000000001','VENDOR-PAID','b1000000-0000-4000-8000-000000000001',gen_random_uuid(),'{}','{"recipient_name":"Private Recipient","phone":"08123","address_line":"Private Street"}',598000,0,0,598000),
 ('b2000000-0000-4000-8000-000000000002','VENDOR-PENDING','b1000000-0000-4000-8000-000000000001',gen_random_uuid(),'{}','{"recipient_name":"Pending Recipient"}',129000,0,0,129000);
insert into public.order_items(id,order_id,position,product_snapshot,creations_snapshot,quantity,normal_unit_price,unit_price,line_total) values
 ('b3000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001',1,
  '{"id":"bundle-3x10ml","label":"PLAY SET","volume_ml":10,"bottle_count":3}',
  '[{"name":"Blend 1","notes":[{"phase":"top","note":{"name":"Yuzu"}},{"phase":"middle","note":{"name":"Tea"}},{"phase":"base","note":{"name":"Musk"}}]},{"name":"Blend 2","notes":[{"phase":"top","note":{"name":"Mint"}},{"phase":"middle","note":{"name":"Jasmine"}},{"phase":"base","note":{"name":"Amber"}}]},{"name":"Blend 3","notes":[{"phase":"top","note":{"name":"Berries"}},{"phase":"middle","note":{"name":"Coffee"}},{"phase":"base","note":{"name":"Vanilla"}}]}]',
  2,299000,299000,598000),
 ('b3000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000002',1,
  '{"id":"10ml","label":"10 ML","volume_ml":10,"bottle_count":1}',
  '[{"name":"Blend 1","notes":[{"phase":"top","note":{"name":"Yuzu"}},{"phase":"middle","note":{"name":"Tea"}},{"phase":"base","note":{"name":"Musk"}}]}]',
  1,129000,129000,129000);

-- Explicitly clear the default: this paid order must remain unassigned until an admin assigns it.
set local role authenticated;
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000002',true);
select public.admin_set_default_vendor(null);
reset role;
update public.orders set payment_status='paid',status='paid' where id='b2000000-0000-4000-8000-000000000001';
do $$ begin
 if exists(select 1 from public.order_vendor_assignments where order_id='b2000000-0000-4000-8000-000000000001') then raise exception 'Order auto-assigned without configured default'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000003',true);
do $$ begin
 begin perform public.admin_assign_vendor('b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000003'); raise exception 'Vendor assigned itself'; exception when insufficient_privilege then null; end;
 if exists(select 1 from public.production_jobs) or exists(select 1 from public.shipments) then raise exception 'Unassigned vendor sees protected projections'; end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000002',true);
do $$ declare result jsonb; repeated jsonb; workspace jsonb; begin
 workspace:=public.admin_vendor_workspace(0);
 if workspace->>'default_vendor_id' is not null or (workspace->>'unassigned_count')::integer<>1 or jsonb_array_length(workspace->'vendors')<>2 then raise exception 'Admin vendor workspace read model is incomplete'; end if;
 result:=public.admin_assign_vendor('b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000003');
 repeated:=public.admin_assign_vendor('b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000003');
 if result->>'vendor_fee_amount'<>'300000' or repeated->>'vendor_fee_amount'<>'300000' then raise exception 'Play Set fee is not 300000'; end if;
 if (public.admin_vendor_assignments(0)->>'count')::integer<>1 then raise exception 'Assignment retry duplicated row or admin cannot monitor assignment'; end if;
 begin perform public.admin_assign_vendor('b2000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000003'); raise exception 'Pending order assigned'; exception when check_violation then null; end;
end $$;
select set_config('app.vendor_assignment_job',(select id::text from public.production_jobs where order_item_id='b3000000-0000-4000-8000-000000000001'),false);
select set_config('app.vendor_assignment_shipment',(select id::text from public.shipments where order_id='b2000000-0000-4000-8000-000000000001'),false);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000004',true);
do $$ begin
 if exists(select 1 from public.production_jobs) or exists(select 1 from public.shipments) then raise exception 'Vendor B sees Vendor A data'; end if;
 begin perform public.advance_production_job(current_setting('app.vendor_assignment_job')::uuid,'start'); raise exception 'Non-assigned vendor started job'; exception when insufficient_privilege then null; end;
 begin perform public.advance_production_job(current_setting('app.vendor_assignment_job')::uuid,'complete'); raise exception 'Non-assigned vendor completed job'; exception when insufficient_privilege then null; end;
 begin perform public.fulfill_shipment(current_setting('app.vendor_assignment_shipment')::uuid,'ship','JNE','REG','X'); raise exception 'Non-assigned vendor fulfilled shipment'; exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000001',true);
do $$ begin
 begin perform 1 from public.order_vendor_assignments; raise exception 'Customer reads vendor fee assignment'; exception when insufficient_privilege then null; end;
 begin perform public.admin_vendor_workspace(0); raise exception 'Customer reads admin vendor workspace'; exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000003',true);
do $$ declare job public.production_jobs; sid uuid; begin
 select * into job from public.production_jobs where order_item_id='b3000000-0000-4000-8000-000000000001';
 if job.formulas_snapshot->0->>'top'<>'Yuzu' then raise exception 'Assigned vendor cannot read formula snapshot'; end if;
 if not exists(select 1 from public.shipments where order_id='b2000000-0000-4000-8000-000000000001') then raise exception 'Assigned vendor cannot read address projection'; end if;
 select id into sid from public.shipments where order_id='b2000000-0000-4000-8000-000000000001';
 begin perform public.fulfill_shipment(sid,'ship','JNE','REG','X'); raise exception 'Vendor shipped before all jobs completed'; exception when check_violation then null; end;
 job:=public.advance_production_job(job.id,'start');
 job:=public.advance_production_job(job.id,'complete');
 if job.status<>'completed' then raise exception 'Assigned vendor cannot complete job'; end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000002',true);
do $$ begin
 begin perform public.admin_assign_vendor('b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000004'); raise exception 'Production-started order changed vendor'; exception when check_violation then null; end;
end $$;
reset role;

-- Explicit default assignment validates a vendor, assigns once after payment, and tolerates repeated paid updates.
set local role authenticated;
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000002',true);
select public.admin_set_default_vendor('b1000000-0000-4000-8000-000000000003');
reset role;
update public.orders set payment_status='paid',status='paid' where id='b2000000-0000-4000-8000-000000000002';
update public.orders set payment_status='paid' where id='b2000000-0000-4000-8000-000000000002';
do $$ begin
 if (select vendor_id from public.order_vendor_assignments where order_id='b2000000-0000-4000-8000-000000000002')<>'b1000000-0000-4000-8000-000000000003' then raise exception 'Validated default did not assign'; end if;
 if (select count(*) from public.order_vendor_assignments where order_id='b2000000-0000-4000-8000-000000000002')<>1 then raise exception 'Repeated paid event duplicated auto assignment'; end if;
end $$;

-- A historic perfumer job remains accessible only while it has no vendor assignment.
update public.production_jobs set vendor_id=null where order_item_id='b3000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000005',true);
do $$ begin
 if not exists(select 1 from public.production_jobs where order_item_id='b3000000-0000-4000-8000-000000000002') then raise exception 'Historical perfumer compatibility lost'; end if;
end $$;
reset role;
select 'PASS: assigned-vendor isolation, paid-only assignment, fee snapshot, auto-assignment idempotency and perfumer compatibility' result;
rollback;
