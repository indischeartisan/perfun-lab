begin;
insert into auth.users(id,email) values
 ('ab100000-0000-4000-8000-000000000001','rates-customer@example.invalid'),
 ('ab100000-0000-4000-8000-000000000002','rates-admin@example.invalid'),
 ('ab100000-0000-4000-8000-000000000003','rates-vendor@example.invalid');
update public.profiles set role='admin' where id='ab100000-0000-4000-8000-000000000002';
update public.profiles set role='vendor' where id='ab100000-0000-4000-8000-000000000003';
insert into public.orders(id,order_number,user_id,request_id,request_payload,address_snapshot,subtotal,discount,shipping,shipping_quote_snapshot,grand_total,payment_status,status) values
 ('ab200000-0000-4000-8000-000000000001','RATES-10ML','ab100000-0000-4000-8000-000000000001',gen_random_uuid(),'{}','{}',50000,0,12000,'{"original_shipping_amount":17000,"shipping_discount":5000,"customer_shipping_total":12000}',62000,'paid','paid'),
 ('ab200000-0000-4000-8000-000000000002','RATES-30ML','ab100000-0000-4000-8000-000000000001',gen_random_uuid(),'{}','{}',100000,0,14000,'{"original_shipping_amount":14000,"shipping_discount":0,"customer_shipping_total":14000}',114000,'paid','paid'),
 ('ab200000-0000-4000-8000-000000000003','RATES-PLAYSET','ab100000-0000-4000-8000-000000000001',gen_random_uuid(),'{}','{}',150000,0,20000,'{"original_shipping_amount":25000,"shipping_discount":5000,"customer_shipping_total":20000}',170000,'paid','paid'),
 ('ab200000-0000-4000-8000-000000000004','RATES-LEGACY','ab100000-0000-4000-8000-000000000001',gen_random_uuid(),'{}','{}',50000,0,10000,null,60000,'paid','paid');
insert into public.order_items(id,order_id,position,product_snapshot,creations_snapshot,quantity,normal_unit_price,unit_price,line_total) values
 ('ab300000-0000-4000-8000-000000000001','ab200000-0000-4000-8000-000000000001',1,'{"id":"10ml"}','[]',1,50000,50000,50000),
 ('ab300000-0000-4000-8000-000000000002','ab200000-0000-4000-8000-000000000002',1,'{"id":"30ml"}','[]',1,100000,100000,100000),
 ('ab300000-0000-4000-8000-000000000003','ab200000-0000-4000-8000-000000000003',1,'{"id":"bundle-3x10ml"}','[]',1,150000,150000,150000),
 ('ab300000-0000-4000-8000-000000000004','ab200000-0000-4000-8000-000000000004',1,'{"id":"10ml"}','[]',1,50000,50000,50000);
set local role authenticated;
select set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000002',true);
do $$ declare settings jsonb; begin
 settings:=public.admin_vendor_fee_settings();
 if (settings->>'service_10ml')::bigint<>50000 or (settings->>'service_30ml')::bigint<>100000 or (settings->>'play_set')::bigint<>150000 then raise exception 'Default perfumer rates are incorrect'; end if;
end $$;
select public.admin_assign_vendor('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000003');
select public.admin_assign_vendor('ab200000-0000-4000-8000-000000000002','ab100000-0000-4000-8000-000000000003');
select public.admin_assign_vendor('ab200000-0000-4000-8000-000000000003','ab100000-0000-4000-8000-000000000003');
select public.admin_assign_vendor('ab200000-0000-4000-8000-000000000004','ab100000-0000-4000-8000-000000000003');
select public.admin_update_vendor_fee_settings(60000,120000);
reset role;
do $$ begin
 if (select sum(vendor_fee_amount) from public.order_vendor_assignments where vendor_id='ab100000-0000-4000-8000-000000000003')<>350000 then raise exception 'Existing assignments did not retain rate snapshots'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000002',true);
do $$ begin
 if (public.admin_vendor_fee_settings()->>'play_set')::bigint<>180000 then raise exception 'Play Set did not track three times the current 10 ml rate'; end if;
end $$;
-- The legacy order is intentionally left without a shipment completion; the
-- payout workspace must never invent a reimbursement for missing source data.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000003',true);
do $$ declare job_id uuid; shipment_id uuid; checklist jsonb:='{"bottles_checked":true,"formula_stickers_checked":true,"bottles_sealed":true,"packaging_ready":true,"recipient_label_checked":true}'; target uuid; payer text; cost bigint; begin
 for target,payer,cost in values
  ('ab200000-0000-4000-8000-000000000001'::uuid,'vendor',12000::bigint),
  ('ab200000-0000-4000-8000-000000000002'::uuid,'perfun',14000::bigint),
  ('ab200000-0000-4000-8000-000000000003'::uuid,'customer',16000::bigint)
 loop
  select id into job_id from public.production_jobs where order_number=(select order_number from public.orders where id=target) and vendor_id=auth.uid();
  if job_id is null then raise exception 'Vendor fixture job was not assigned for %', target; end if;
  perform public.advance_production_job(job_id,'start'); perform public.advance_production_job(job_id,'complete');
  select id into shipment_id from public.shipments where order_id=target;
  perform public.save_shipment_packing(shipment_id,checklist,true);
  perform public.save_actual_shipping(shipment_id,cost,payer);
  perform public.fulfill_shipment(shipment_id,'ship','JNE','REG','RATES-'||right(target::text,4));
 end loop;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000002',true);
do $$ declare workspace jsonb; payout jsonb; begin
 workspace:=public.admin_vendor_payout_workspace(0);
 if (workspace->>'eligible_count')::integer<>3 or (workspace->>'review_count')::integer<>0 then raise exception 'Eligibility or review count incorrect'; end if;
 if not exists(select 1 from jsonb_array_elements(workspace->'eligible_orders') x where x->>'order_number'='RATES-10ML' and (x->>'shipping_reimbursement')::bigint=17000) then raise exception 'Voucher reimbursement did not use original RajaOngkir rate'; end if;
 if exists(select 1 from jsonb_array_elements(workspace->'eligible_orders') x where x->>'order_number'='RATES-30ML' and (x->>'shipping_reimbursement')::bigint<>0) then raise exception 'Perfun Lab shipping was reimbursed'; end if;
 payout:=public.admin_create_vendor_payout('ab100000-0000-4000-8000-000000000003',gen_random_uuid(),null);
 if (payout->>'total')::bigint<>467000 then raise exception 'Payout total did not use fee snapshots and original shipping rates'; end if;
end $$;
select 'PASS: perfumer rate snapshots, Play Set, voucher-safe reimbursement and payer rules' as result;
rollback;
