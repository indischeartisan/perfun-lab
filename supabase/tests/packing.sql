begin;
insert into auth.users(id,email) values
 ('f1000000-0000-4000-8000-000000000001','packing-customer@example.invalid'),
 ('f1000000-0000-4000-8000-000000000002','packing-admin@example.invalid'),
 ('f1000000-0000-4000-8000-000000000003','packing-vendor-a@example.invalid'),
 ('f1000000-0000-4000-8000-000000000004','packing-vendor-b@example.invalid');
update public.profiles set role='admin' where id='f1000000-0000-4000-8000-000000000002';
update public.profiles set role='vendor' where id in ('f1000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000004');
insert into public.orders(id,order_number,user_id,request_id,request_payload,address_snapshot,subtotal,discount,shipping,grand_total,payment_status,status)
values ('f2000000-0000-4000-8000-000000000001','PACKING-TEST','f1000000-0000-4000-8000-000000000001',gen_random_uuid(),'{}','{"recipient_name":"Packing Recipient","phone":"081200000000","address_line":"Packing Street 1","district":"Kecamatan Test","city":"Bandung","province":"Jawa Barat","postal_code":"40111","delivery_note":"Leave with security"}',50000,0,10000,60000,'paid','paid');
insert into public.order_items(id,order_id,position,product_snapshot,creations_snapshot,quantity,normal_unit_price,unit_price,line_total)
values ('f3000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001',1,'{"id":"10ml","label":"10 ML","volume_ml":10,"bottle_count":1}','[]',1,50000,50000,50000);
set local role authenticated;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000002',true);
select public.admin_assign_vendor('f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000003');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000003',true);
do $$ declare job_id uuid; begin
 select id into job_id from public.production_jobs where order_item_id='f3000000-0000-4000-8000-000000000001';
 perform public.advance_production_job(job_id,'start');
 perform public.advance_production_job(job_id,'complete');
end $$;
do $$ declare shipment_id uuid; partial jsonb:='{"bottles_checked":true,"formula_stickers_checked":true,"bottles_sealed":false,"packaging_ready":false,"recipient_label_checked":false}'; s public.shipments; begin
 select id into shipment_id from public.shipments where order_id='f2000000-0000-4000-8000-000000000001';
 if shipment_id is null then raise exception 'Assigned vendor cannot see shipment'; end if;
 begin perform public.save_shipment_packing(shipment_id,partial,true); raise exception 'Incomplete packing was completed'; exception when check_violation then null; end;
 s:=public.save_shipment_packing(shipment_id,partial,false);
 if s.packing_status<>'in_progress' then raise exception 'Partial checklist was not saved'; end if;
 begin perform public.fulfill_shipment(shipment_id,'ship','JNE','REG',''); raise exception 'Empty tracking number was accepted'; exception when check_violation then null; end;
 begin perform public.fulfill_shipment(shipment_id,'deliver','','',''); raise exception 'Vendor delivered shipment'; exception when insufficient_privilege then null; end;
 s:=public.fulfill_shipment(shipment_id,'ship','JNE','REG','PACK-1');
 if s.status<>'shipped' or s.packing_status<>'in_progress' or s.actual_shipping_cost is not null or s.shipping_payer is not null or s.courier<>'JNE' or s.service<>'REG' then raise exception 'Vendor dispatch must not require packing or actual shipping cost'; end if;
 begin perform public.fulfill_shipment(shipment_id,'deliver','','',''); raise exception 'Vendor delivered dispatched shipment'; exception when insufficient_privilege then null; end;
 perform set_config('app.test_shipment_id',shipment_id::text,false);
end $$;
-- Recreate a pre-feature dispatched row only in this disposable transaction.
-- The guard did not exist when historical rows were created; immediately restore it.
reset role;
alter table public.shipments disable trigger shipment_packing_shipping_guard;
update public.shipments set packing_status='legacy_unknown',packed_at=null,packed_by=null
 where order_id='f2000000-0000-4000-8000-000000000001';
alter table public.shipments enable trigger shipment_packing_shipping_guard;
set local role authenticated;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000003',true);
do $$ declare result jsonb; begin
 result:=public.list_fulfillment_shipments('shipped',0);
 if result->'rows'->0->>'packing_status'<>'legacy_unknown' then raise exception 'Legacy shipment history not visible'; end if;
 if jsonb_typeof(result->'rows'->0->'formula_jobs')<>'array' then raise exception 'Shipment formula snapshots are not returned in the shipment RPC'; end if;
 begin
  perform public.save_shipment_packing((result->'rows'->0->>'id')::uuid,'{"bottles_checked":true,"formula_stickers_checked":true,"bottles_sealed":true,"packaging_ready":true,"recipient_label_checked":true}',true);
  raise exception 'Legacy packing was rewritten';
 exception when check_violation then null; end;
end $$;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000004',true);
do $$ declare shipment_id uuid:=current_setting('app.test_shipment_id')::uuid; result jsonb; begin
 select id into shipment_id from public.shipments where order_id='f2000000-0000-4000-8000-000000000001';
 if shipment_id is not null then raise exception 'Other vendor reads assigned shipment'; end if;
 begin perform public.fulfill_shipment(current_setting('app.test_shipment_id')::uuid,'ship','JNE','REG','OTHER-1'); raise exception 'Other vendor can dispatch assigned shipment'; exception when insufficient_privilege then null; end;
 begin perform public.save_shipment_packing('f4000000-0000-4000-8000-000000000001','{}',false); raise exception 'Other vendor can pack'; exception when insufficient_privilege then null; end;
 result:=public.list_fulfillment_shipments('shipped',0);
 if (result->>'count')::integer<>0 then raise exception 'Other vendor receives fulfillment RPC rows'; end if;
end $$;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true);
do $$ declare shipment_id uuid; begin
 select id into shipment_id from public.shipments where order_id='f2000000-0000-4000-8000-000000000001';
 begin perform public.fulfill_shipment(shipment_id,'deliver','','',''); raise exception 'Customer can change shipment state'; exception when insufficient_privilege then null; end;
 begin perform actual_shipping_cost from public.shipments where order_id='f2000000-0000-4000-8000-000000000001'; raise exception 'Customer reads internal actual cost'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000002',true);
do $$ declare shipment_id uuid; delivered public.shipments; begin
 select id into shipment_id from public.shipments where order_id='f2000000-0000-4000-8000-000000000001';
 delivered:=public.fulfill_shipment(shipment_id,'deliver','','','');
 if delivered.status<>'delivered' or delivered.delivered_at is null then raise exception 'Admin could not deliver dispatched shipment'; end if;
end $$;
reset role;
select 'PASS: packing checklist, assignment isolation, actual shipping finality, and internal-cost column protection' as result;
rollback;
