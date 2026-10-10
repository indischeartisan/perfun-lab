begin;
insert into auth.users(id,email) values
 ('aa100000-0000-4000-8000-000000000001','payout-customer@example.invalid'),
 ('aa100000-0000-4000-8000-000000000002','payout-admin@example.invalid'),
 ('aa100000-0000-4000-8000-000000000003','payout-vendor-a@example.invalid'),
 ('aa100000-0000-4000-8000-000000000004','payout-vendor-b@example.invalid'),
 ('aa100000-0000-4000-8000-000000000005','payout-vendor-c@example.invalid');
update public.profiles set role='admin' where id='aa100000-0000-4000-8000-000000000002';
update public.profiles set role='vendor' where id in ('aa100000-0000-4000-8000-000000000003','aa100000-0000-4000-8000-000000000004','aa100000-0000-4000-8000-000000000005');
insert into public.orders(id,order_number,user_id,request_id,request_payload,address_snapshot,subtotal,discount,shipping,grand_total,payment_status,status) values
 ('aa200000-0000-4000-8000-000000000001','PAYOUT-10ML','aa100000-0000-4000-8000-000000000001',gen_random_uuid(),'{}','{"recipient_name":"Payout Customer"}',50000,0,10000,60000,'paid','paid'),
 ('aa200000-0000-4000-8000-000000000002','PAYOUT-30ML','aa100000-0000-4000-8000-000000000001',gen_random_uuid(),'{}','{"recipient_name":"Payout Customer"}',100000,0,10000,110000,'paid','paid'),
 ('aa200000-0000-4000-8000-000000000003','PAYOUT-PLAYSET','aa100000-0000-4000-8000-000000000001',gen_random_uuid(),'{}','{"recipient_name":"Payout Customer"}',300000,0,10000,310000,'paid','paid'),
 ('aa200000-0000-4000-8000-000000000004','PAYOUT-INCOMPLETE','aa100000-0000-4000-8000-000000000001',gen_random_uuid(),'{}','{"recipient_name":"Payout Customer"}',50000,0,10000,60000,'paid','paid'),
 ('aa200000-0000-4000-8000-000000000005','PAYOUT-VENDOR-B','aa100000-0000-4000-8000-000000000001',gen_random_uuid(),'{}','{"recipient_name":"Payout Customer"}',50000,0,10000,60000,'paid','paid');
insert into public.order_items(id,order_id,position,product_snapshot,creations_snapshot,quantity,normal_unit_price,unit_price,line_total) values
 ('aa300000-0000-4000-8000-000000000001','aa200000-0000-4000-8000-000000000001',1,'{"id":"10ml","label":"10 ML","volume_ml":10,"bottle_count":1}','[]',1,50000,50000,50000),
 ('aa300000-0000-4000-8000-000000000002','aa200000-0000-4000-8000-000000000002',1,'{"id":"30ml","label":"30 ML","volume_ml":30,"bottle_count":1}','[]',1,100000,100000,100000),
 ('aa300000-0000-4000-8000-000000000003','aa200000-0000-4000-8000-000000000003',1,'{"id":"bundle-3x10ml","label":"Play Set","volume_ml":10,"bottle_count":3}','[]',2,150000,150000,300000),
 ('aa300000-0000-4000-8000-000000000004','aa200000-0000-4000-8000-000000000004',1,'{"id":"10ml","label":"10 ML","volume_ml":10,"bottle_count":1}','[]',1,50000,50000,50000),
 ('aa300000-0000-4000-8000-000000000005','aa200000-0000-4000-8000-000000000005',1,'{"id":"10ml","label":"10 ML","volume_ml":10,"bottle_count":1}','[]',1,50000,50000,50000);
set local role authenticated;
select set_config('request.jwt.claim.sub','aa100000-0000-4000-8000-000000000002',true);
select public.admin_assign_vendor('aa200000-0000-4000-8000-000000000001','aa100000-0000-4000-8000-000000000003');
select public.admin_assign_vendor('aa200000-0000-4000-8000-000000000002','aa100000-0000-4000-8000-000000000003');
select public.admin_assign_vendor('aa200000-0000-4000-8000-000000000003','aa100000-0000-4000-8000-000000000003');
select public.admin_assign_vendor('aa200000-0000-4000-8000-000000000004','aa100000-0000-4000-8000-000000000003');
select public.admin_assign_vendor('aa200000-0000-4000-8000-000000000005','aa100000-0000-4000-8000-000000000004');
-- A vendor with no shipped work cannot create an empty payout batch.
do $$ begin perform public.admin_create_vendor_payout('aa100000-0000-4000-8000-000000000005','aa400000-0000-4000-8000-000000000001',null); raise exception 'Empty payout was created'; exception when check_violation then null; end $$;
reset role;
do $$ begin
 if (select count(*) from public.production_jobs j join public.order_items i on i.id=j.order_item_id where i.order_id in ('aa200000-0000-4000-8000-000000000001','aa200000-0000-4000-8000-000000000002','aa200000-0000-4000-8000-000000000003') and j.vendor_id='aa100000-0000-4000-8000-000000000003')<>3 then raise exception 'Vendor assignment was not projected to all Vendor A jobs'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','aa100000-0000-4000-8000-000000000003',true);
do $$ declare job_id uuid; shipment_id uuid; checklist jsonb:='{"bottles_checked":true,"formula_stickers_checked":true,"bottles_sealed":true,"packaging_ready":true,"recipient_label_checked":true}'; target uuid; payer text; cost bigint; begin
 for target,payer,cost in values
  ('aa200000-0000-4000-8000-000000000001'::uuid,'vendor',12000::bigint),
  ('aa200000-0000-4000-8000-000000000002'::uuid,'perfun',14000::bigint),
  ('aa200000-0000-4000-8000-000000000003'::uuid,'customer',16000::bigint)
 loop
  select j.id into job_id from public.production_jobs j join public.order_items i on i.id=j.order_item_id where i.order_id=target;
  perform public.advance_production_job(job_id,'start'); perform public.advance_production_job(job_id,'complete');
  select id into shipment_id from public.shipments where order_id=target;
  perform public.save_shipment_packing(shipment_id,checklist,true);
  perform public.save_actual_shipping(shipment_id,cost,payer);
  perform public.fulfill_shipment(shipment_id,'ship','JNE','REG','PAYOUT-'||right(target::text,4));
 end loop;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','aa100000-0000-4000-8000-000000000004',true);
do $$ declare job_id uuid; shipment_id uuid; checklist jsonb:='{"bottles_checked":true,"formula_stickers_checked":true,"bottles_sealed":true,"packaging_ready":true,"recipient_label_checked":true}'; begin
 select j.id into job_id from public.production_jobs j join public.order_items i on i.id=j.order_item_id where i.order_id='aa200000-0000-4000-8000-000000000005';
 perform public.advance_production_job(job_id,'start'); perform public.advance_production_job(job_id,'complete');
 select id into shipment_id from public.shipments where order_id='aa200000-0000-4000-8000-000000000005';
 perform public.save_shipment_packing(shipment_id,checklist,true); perform public.save_actual_shipping(shipment_id,8000,'vendor'); perform public.fulfill_shipment(shipment_id,'ship','JNE','REG','PAYOUT-B');
end $$;
-- Vendors can neither create nor mark financial records and cannot read another vendor's dashboard.
do $$ begin
 begin perform public.admin_create_vendor_payout('aa100000-0000-4000-8000-000000000004','aa400000-0000-4000-8000-000000000002',null); raise exception 'Vendor created payout'; exception when insufficient_privilege then null; end;
 begin perform public.admin_mark_vendor_payout_paid(gen_random_uuid(),'REF'); raise exception 'Vendor marked payout paid'; exception when insufficient_privilege then null; end;
 if (public.vendor_payout_dashboard(0)->>'count')::integer<>0 then raise exception 'Vendor B sees Vendor A payout before any own batch'; end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','aa100000-0000-4000-8000-000000000002',true);
do $$ declare first_batch jsonb; retry_batch jsonb; payout_id uuid; second_batch jsonb; b_batch jsonb; total bigint; begin
 first_batch:=public.admin_create_vendor_payout('aa100000-0000-4000-8000-000000000003','aa400000-0000-4000-8000-000000000003',null);
 retry_batch:=public.admin_create_vendor_payout('aa100000-0000-4000-8000-000000000003','aa400000-0000-4000-8000-000000000003',null);
 payout_id:=(first_batch->>'id')::uuid;
 if payout_id<>(retry_batch->>'id')::uuid or jsonb_array_length(first_batch->'items')<>3 or (first_batch->>'total')::bigint<>462000 then raise exception 'Snapshot fees or retry idempotency failed'; end if;
 if not exists(select 1 from jsonb_array_elements(first_batch->'items') item where item->>'order_number'='PAYOUT-10ML' and (item->>'vendor_fee_amount')::bigint=50000 and (item->>'shipping_reimbursement')::bigint=12000)
  or not exists(select 1 from jsonb_array_elements(first_batch->'items') item where item->>'order_number'='PAYOUT-30ML' and (item->>'vendor_fee_amount')::bigint=100000 and (item->>'shipping_reimbursement')::bigint=0)
  or not exists(select 1 from jsonb_array_elements(first_batch->'items') item where item->>'order_number'='PAYOUT-PLAYSET' and (item->>'vendor_fee_amount')::bigint=300000 and (item->>'shipping_reimbursement')::bigint=0) then raise exception 'Fee/reimbursement rules failed'; end if;
 if exists(select 1 from jsonb_array_elements(first_batch->'items') item where item->>'order_number'='PAYOUT-INCOMPLETE') then raise exception 'Incomplete historical data was counted'; end if;
 begin perform public.admin_create_vendor_payout('aa100000-0000-4000-8000-000000000003','aa400000-0000-4000-8000-000000000004',null); raise exception 'A second active payout reused orders'; exception when check_violation then null; end;
 perform public.admin_mark_vendor_payout_paid(payout_id,'BANK-REF-001');
 begin perform public.admin_void_vendor_payout(payout_id,'too late'); raise exception 'Paid payout voided'; exception when check_violation then null; end;
 begin perform public.admin_mark_vendor_payout_paid(payout_id,'OTHER-REF'); raise exception 'Paid payout reference changed'; exception when check_violation then null; end;
 b_batch:=public.admin_create_vendor_payout('aa100000-0000-4000-8000-000000000004','aa400000-0000-4000-8000-000000000005',null);
 if (b_batch->>'total')::bigint<>58000 then raise exception 'Vendor B payout incorrect'; end if;
 perform public.admin_void_vendor_payout((b_batch->>'id')::uuid,'Bank details need correction');
 second_batch:=public.admin_create_vendor_payout('aa100000-0000-4000-8000-000000000004','aa400000-0000-4000-8000-000000000006',null);
 if (second_batch->>'id')=(b_batch->>'id') or (second_batch->>'total')::bigint<>58000 then raise exception 'Void did not safely release draft eligibility'; end if;
end $$;
select set_config('request.jwt.claim.sub','aa100000-0000-4000-8000-000000000003',true);
do $$ declare dashboard jsonb; begin
 dashboard:=public.vendor_payout_dashboard(0);
 if (dashboard->>'count')::integer<>1 or (dashboard->>'paid_total')::bigint<>462000 or dashboard::text like '%PAYOUT-VENDOR-B%' then raise exception 'Vendor A payout isolation failed'; end if;
 begin perform 1 from public.vendor_payouts; raise exception 'Vendor direct table read allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 if private.wib_payout_date('2026-10-09 16:59:59+00'::timestamptz)<>date '2026-10-09' or private.wib_payout_date('2026-10-09 17:00:00+00'::timestamptz)<>date '2026-10-10' then raise exception 'WIB payout date boundary failed'; end if;
end $$;
select 'PASS: snapshot fees, payout eligibility, reimbursement, RLS, idempotency, void release, paid immutability and WIB boundaries' as result;
rollback;
