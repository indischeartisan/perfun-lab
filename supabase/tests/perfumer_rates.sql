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
 ('ab300000-0000-4000-8000-000000000001','ab200000-0000-4000-8000-000000000001',1,'{"id":"10ml","label":"10 ML","volume_ml":10,"bottle_count":1}','[]',1,50000,50000,50000),
 ('ab300000-0000-4000-8000-000000000002','ab200000-0000-4000-8000-000000000002',1,'{"id":"30ml","label":"30 ML","volume_ml":30,"bottle_count":1}','[]',1,100000,100000,100000),
 ('ab300000-0000-4000-8000-000000000003','ab200000-0000-4000-8000-000000000003',1,'{"id":"bundle-3x10ml","label":"Play Set","volume_ml":10,"bottle_count":3}','[]',1,150000,150000,150000),
 ('ab300000-0000-4000-8000-000000000004','ab200000-0000-4000-8000-000000000004',1,'{"id":"10ml","label":"10 ML","volume_ml":10,"bottle_count":1}','[]',1,50000,50000,50000);
insert into public.production_jobs(order_item_id)
select i.id from public.order_items i
where i.order_id in ('ab200000-0000-4000-8000-000000000001','ab200000-0000-4000-8000-000000000002','ab200000-0000-4000-8000-000000000003','ab200000-0000-4000-8000-000000000004')
  and not exists(select 1 from public.production_jobs existing where existing.order_item_id=i.id);
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
reset role;
insert into public.production_jobs(order_item_id)
select i.id from public.order_items i
where i.order_id in ('ab200000-0000-4000-8000-000000000001','ab200000-0000-4000-8000-000000000002','ab200000-0000-4000-8000-000000000003','ab200000-0000-4000-8000-000000000004')
  and not exists(select 1 from public.production_jobs existing where existing.order_item_id=i.id);
update public.production_jobs j set vendor_id='ab100000-0000-4000-8000-000000000003'
from public.order_items i where i.id=j.order_item_id and i.order_id in ('ab200000-0000-4000-8000-000000000001','ab200000-0000-4000-8000-000000000002','ab200000-0000-4000-8000-000000000003','ab200000-0000-4000-8000-000000000004');
do $$ begin
 if (select count(*) from public.production_jobs j join public.order_items i on i.id=j.order_item_id where i.order_id in ('ab200000-0000-4000-8000-000000000001','ab200000-0000-4000-8000-000000000002','ab200000-0000-4000-8000-000000000003'))<>3 then raise exception 'Test production jobs are missing after fixture setup'; end if;
 if (select count(*) from public.production_jobs j join public.order_items i on i.id=j.order_item_id where i.order_id in ('ab200000-0000-4000-8000-000000000001','ab200000-0000-4000-8000-000000000002','ab200000-0000-4000-8000-000000000003') and j.vendor_id='ab100000-0000-4000-8000-000000000003')<>3 then raise exception 'Test production jobs have the wrong vendor after fixture setup'; end if;
 perform set_config('app.rates_job_1',(select j.id::text from public.production_jobs j join public.order_items i on i.id=j.order_item_id where i.order_id='ab200000-0000-4000-8000-000000000001' and j.vendor_id='ab100000-0000-4000-8000-000000000003' limit 1),true);
 perform set_config('app.rates_job_2',(select j.id::text from public.production_jobs j join public.order_items i on i.id=j.order_item_id where i.order_id='ab200000-0000-4000-8000-000000000002' and j.vendor_id='ab100000-0000-4000-8000-000000000003' limit 1),true);
 perform set_config('app.rates_job_3',(select j.id::text from public.production_jobs j join public.order_items i on i.id=j.order_item_id where i.order_id='ab200000-0000-4000-8000-000000000003' and j.vendor_id='ab100000-0000-4000-8000-000000000003' limit 1),true);
 perform set_config('app.rates_job_4',(select j.id::text from public.production_jobs j join public.order_items i on i.id=j.order_item_id where i.order_id='ab200000-0000-4000-8000-000000000004' and j.vendor_id='ab100000-0000-4000-8000-000000000003' limit 1),true);
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000002',true);
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
-- The legacy order is dispatched with a vendor payer but no checkout snapshot;
-- it must remain review-only rather than receiving a guessed reimbursement.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000003',true);
do $$ declare job_id uuid; shipment_id uuid; checklist jsonb:='{"bottles_checked":true,"formula_stickers_checked":true,"bottles_sealed":true,"packaging_ready":true,"recipient_label_checked":true}'; target uuid; payer text; cost bigint; begin
 for target,payer,cost in values
  ('ab200000-0000-4000-8000-000000000001'::uuid,'vendor',12000::bigint),
  ('ab200000-0000-4000-8000-000000000002'::uuid,'perfun',14000::bigint),
  ('ab200000-0000-4000-8000-000000000003'::uuid,'customer',16000::bigint),
  ('ab200000-0000-4000-8000-000000000004'::uuid,'vendor',10000::bigint)
 loop
  job_id:=case target
    when 'ab200000-0000-4000-8000-000000000001'::uuid then current_setting('app.rates_job_1')::uuid
    when 'ab200000-0000-4000-8000-000000000002'::uuid then current_setting('app.rates_job_2')::uuid
    when 'ab200000-0000-4000-8000-000000000003'::uuid then current_setting('app.rates_job_3')::uuid
    when 'ab200000-0000-4000-8000-000000000004'::uuid then current_setting('app.rates_job_4')::uuid
  end;
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
do $$ declare workspace jsonb; finance jsonb; payout jsonb; monthly jsonb; actual_total bigint; diagnostic_rows jsonb; wib_today date:='2026-11-17'; begin
 workspace:=public.admin_vendor_payout_workspace(0);
 finance:=public.admin_finance('all',null);
 if (workspace->>'eligible_count')::integer<>3 or (workspace->>'review_count')::integer<>1 or (workspace->>'outstanding_service')::bigint<>300000 or (workspace->>'outstanding_shipping')::bigint<>17000 or (workspace->>'outstanding_total')::bigint<>317000 then raise exception 'Eligibility summary does not match payout-ready orders'; end if;
 if (finance->'vendor'->>'outstanding_total')::bigint<>317000 then raise exception 'Finance summary does not match payout workspace'; end if;
 if not exists(select 1 from jsonb_array_elements(workspace->'review_orders') x where x->>'order_number'='RATES-LEGACY' and x->>'review_reason'='Tarif RajaOngkir sebelum voucher tidak tersimpan') then raise exception 'Missing original shipping rate was not marked for review'; end if;
 if not exists(select 1 from jsonb_array_elements(workspace->'eligible_orders') x where x->>'order_number'='RATES-10ML' and (x->>'shipping_reimbursement')::bigint=17000) then raise exception 'Voucher reimbursement did not use original RajaOngkir rate'; end if;
 if exists(select 1 from jsonb_array_elements(workspace->'eligible_orders') x where x->>'order_number'='RATES-30ML' and (x->>'shipping_reimbursement')::bigint<>0) then raise exception 'Perfun Lab shipping was reimbursed'; end if;
 -- The recap uses the stored first-ready moment in WIB, not order or payout dates.
 reset role;
 update public.order_vendor_assignments set payout_ready_at=(wib_today::timestamp + interval '00:01') at time zone 'Asia/Jakarta' where order_id in ('ab200000-0000-4000-8000-000000000001','ab200000-0000-4000-8000-000000000003');
 update public.order_vendor_assignments set payout_ready_at=((wib_today-1)::timestamp + interval '23:59') at time zone 'Asia/Jakarta' where order_id='ab200000-0000-4000-8000-000000000002';
 set local role authenticated;
 perform set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000002',true);
 workspace:=public.admin_vendor_payout_recap('day',wib_today);
 if (workspace->>'ready_count')::integer<>2 or (workspace->>'ready_service')::bigint<>200000 or (workspace->>'ready_shipping')::bigint<>17000 or (workspace->>'ready_total')::bigint<>217000 or (workspace->>'older_count')::integer<>1 or (workspace->>'older_total')::bigint<>100000 or (workspace->>'all_ready_total')::bigint<>317000 then raise exception 'Daily WIB recap did not separate today from older ready orders: %',workspace; end if;
 if exists(select 1 from jsonb_array_elements(workspace->'ready_orders') x where (x->>'ready_date')::date<>wib_today) then raise exception 'Daily recap crossed a WIB date boundary'; end if;
 monthly:=public.admin_vendor_payout_recap('month',wib_today);
 if (monthly->>'ready_count')::integer<>3 or (monthly->>'ready_service')::bigint<>300000 or (monthly->>'ready_shipping')::bigint<>17000 or (monthly->>'ready_total')::bigint<>317000 or (monthly->>'review_count')::integer<>1 then raise exception 'Monthly recap did not include this-month earlier ready order or excluded review order: %',monthly; end if;
 reset role;
 set local role authenticated;
 perform set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000003',true);
 finance:=public.vendor_payout_recap('day',wib_today);
 if (finance->>'ready_total')::bigint<>217000 or (finance->>'older_total')::bigint<>100000 or (finance->>'all_ready_total')::bigint<>317000 or exists(select 1 from jsonb_array_elements(finance->'ready_orders') x where x->>'vendor_id'<>'ab100000-0000-4000-8000-000000000003') then raise exception 'Vendor recap differs from the Admin recap or leaked another vendor: %',finance; end if;
 reset role;
 set local role authenticated;
 perform set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000002',true);
 payout:=public.admin_create_vendor_payout('ab100000-0000-4000-8000-000000000003',gen_random_uuid(),null);
 actual_total:=(payout->>'total')::bigint;
 if actual_total<>317000 then
  select coalesce(jsonb_agg(jsonb_build_object(
   'order_number',eligible->>'order_number',
   'included_in_draft',exists(select 1 from jsonb_array_elements(payout->'items') item where item->>'order_number'=eligible->>'order_number'),
   'assigned_vendor_fee',eligible->'vendor_fee_amount',
   'shipping_payer',eligible->'shipping_payer',
   'original_rajaongkir_before_voucher',eligible->'original_shipping_amount',
   'shipping_reimbursement',coalesce((select item->'shipping_reimbursement' from jsonb_array_elements(payout->'items') item where item->>'order_number'=eligible->>'order_number' limit 1),'null'::jsonb)
  ) order by eligible->>'order_number'),'[]'::jsonb)
  into diagnostic_rows from jsonb_array_elements(workspace->'eligible_orders') eligible;
  raise exception 'Payout total did not use fee snapshots and original shipping rates: expected %, actual %, rows %',317000,actual_total,diagnostic_rows;
 end if;
 if not exists(select 1 from jsonb_array_elements(payout->'items') item where item->>'order_number'='RATES-10ML' and (item->>'vendor_fee_amount')::bigint=50000 and (item->>'shipping_reimbursement')::bigint=17000)
  or not exists(select 1 from jsonb_array_elements(payout->'items') item where item->>'order_number'='RATES-30ML' and (item->>'vendor_fee_amount')::bigint=100000 and (item->>'shipping_reimbursement')::bigint=0)
  or not exists(select 1 from jsonb_array_elements(payout->'items') item where item->>'order_number'='RATES-PLAYSET' and (item->>'vendor_fee_amount')::bigint=150000 and (item->>'shipping_reimbursement')::bigint=0) then raise exception 'Payout item snapshots or shipping reimbursement are incorrect'; end if;
 workspace:=public.admin_vendor_payout_workspace(0);
 finance:=public.admin_finance('all',null);
 if (workspace->>'eligible_count')::integer<>0 or (workspace->>'outstanding_total')::bigint<>0 or (finance->'vendor'->>'draft_total')::bigint<>317000 then raise exception 'Draft and Finance summary did not refresh from the same order set'; end if;
end $$;
select 'PASS: perfumer rate snapshots, Play Set, voucher-safe reimbursement and payer rules' as result;
rollback;
