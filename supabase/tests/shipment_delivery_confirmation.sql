-- Disposable regression for customer/admin delivery confirmation. The public
-- RPCs run under their real application roles; audit assertions use the local
-- test harness only after those authorization checks complete.
begin;
insert into auth.users(id,email) values
 ('d1000000-0000-4000-8000-000000000001','delivery-customer-a@example.invalid'),
 ('d1000000-0000-4000-8000-000000000002','delivery-customer-b@example.invalid'),
 ('d1000000-0000-4000-8000-000000000003','delivery-admin@example.invalid'),
 ('d1000000-0000-4000-8000-000000000004','delivery-vendor-a@example.invalid'),
 ('d1000000-0000-4000-8000-000000000005','delivery-vendor-b@example.invalid'),
 ('d1000000-0000-4000-8000-000000000006','delivery-perfumer@example.invalid');
update public.profiles set role='admin' where id='d1000000-0000-4000-8000-000000000003';
update public.profiles set role='vendor' where id in ('d1000000-0000-4000-8000-000000000004','d1000000-0000-4000-8000-000000000005');
update public.profiles set role='perfumer' where id='d1000000-0000-4000-8000-000000000006';

insert into public.orders(id,order_number,user_id,request_id,request_payload,address_snapshot,subtotal,discount,shipping,grand_total,payment_status,status)
values
 ('d2000000-0000-4000-8000-000000000001','DELIVERY-A','d1000000-0000-4000-8000-000000000001',gen_random_uuid(),'{}','{"recipient_name":"Customer A","phone":"081200000001","address_line":"Delivery Street 1","city":"Bandung","province":"Jawa Barat","postal_code":"40111"}',50000,0,10000,60000,'paid','paid'),
 ('d2000000-0000-4000-8000-000000000002','DELIVERY-B','d1000000-0000-4000-8000-000000000002',gen_random_uuid(),'{}','{"recipient_name":"Customer B","phone":"081200000002","address_line":"Delivery Street 2","city":"Bandung","province":"Jawa Barat","postal_code":"40112"}',50000,0,10000,60000,'paid','paid'),
 ('d2000000-0000-4000-8000-000000000003','DELIVERY-ADMIN','d1000000-0000-4000-8000-000000000001',gen_random_uuid(),'{}','{"recipient_name":"Admin delivery","phone":"081200000003","address_line":"Delivery Street 3","city":"Bandung","province":"Jawa Barat","postal_code":"40113"}',50000,0,10000,60000,'paid','paid'),
 ('d2000000-0000-4000-8000-000000000004','DELIVERY-NOT-SHIPPED','d1000000-0000-4000-8000-000000000001',gen_random_uuid(),'{}','{"recipient_name":"Not shipped","phone":"081200000004","address_line":"Delivery Street 4","city":"Bandung","province":"Jawa Barat","postal_code":"40114"}',50000,0,10000,60000,'paid','paid');
insert into public.order_items(id,order_id,position,product_snapshot,creations_snapshot,quantity,normal_unit_price,unit_price,line_total)
values
 ('d3000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001',1,'{"id":"10ml","label":"10 ML","volume_ml":10,"bottle_count":1}','[]',1,50000,50000,50000),
 ('d3000000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-000000000002',1,'{"id":"10ml","label":"10 ML","volume_ml":10,"bottle_count":1}','[]',1,50000,50000,50000),
 ('d3000000-0000-4000-8000-000000000003','d2000000-0000-4000-8000-000000000003',1,'{"id":"10ml","label":"10 ML","volume_ml":10,"bottle_count":1}','[]',1,50000,50000,50000),
 ('d3000000-0000-4000-8000-000000000004','d2000000-0000-4000-8000-000000000004',1,'{"id":"10ml","label":"10 ML","volume_ml":10,"bottle_count":1}','[]',1,50000,50000,50000);

set local role authenticated;
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000003',true);
select public.admin_assign_vendor('d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000004');
select public.admin_assign_vendor('d2000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000004');
select public.admin_assign_vendor('d2000000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000004');
select public.admin_assign_vendor('d2000000-0000-4000-8000-000000000004','d1000000-0000-4000-8000-000000000004');
reset role;

-- Assigned vendor prepares and dispatches three orders. The fourth becomes
-- ready-to-ship only, to prove a customer cannot confirm early.
set local role authenticated;
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000004',true);
do $$ declare item_id uuid; shipment_id uuid; current_order_id uuid; begin
 foreach current_order_id in array array['d2000000-0000-4000-8000-000000000001'::uuid,'d2000000-0000-4000-8000-000000000002'::uuid,'d2000000-0000-4000-8000-000000000003'::uuid,'d2000000-0000-4000-8000-000000000004'::uuid] loop
  select i.id into item_id from public.order_items i where i.order_id=current_order_id;
  perform public.advance_production_job((select id from public.production_jobs where order_item_id=item_id),'start');
  perform public.advance_production_job((select id from public.production_jobs where order_item_id=item_id),'complete');
 end loop;
 foreach current_order_id in array array['d2000000-0000-4000-8000-000000000001'::uuid,'d2000000-0000-4000-8000-000000000002'::uuid,'d2000000-0000-4000-8000-000000000003'::uuid] loop
  select s.id into shipment_id from public.shipments s where s.order_id=current_order_id;
  perform public.fulfill_shipment(shipment_id,'ship','J&T','EZ','DELIVERY-' || right(current_order_id::text,4));
 end loop;
end $$;
reset role;

-- Customer A can complete only their own shipped order. A repeated submit is
-- safe and does not add a second audit event or rewrite protected fields.
set local role authenticated;
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000001',true);
do $$ declare mine uuid; other_id uuid; ready_id uuid; before_courier text; before_service text; before_tracking text; before_shipped timestamptz; first_result public.shipments; second_result public.shipments; begin
 select id into mine from public.shipments where order_id='d2000000-0000-4000-8000-000000000001';
 select id into other_id from public.shipments where order_id='d2000000-0000-4000-8000-000000000002';
 select id into ready_id from public.shipments where order_id='d2000000-0000-4000-8000-000000000004';
 select courier,service,tracking_number,shipped_at into before_courier,before_service,before_tracking,before_shipped from public.shipments where id=mine;
 begin perform public.confirm_shipment_received(other_id); raise exception 'Customer confirmed another customer shipment'; exception when insufficient_privilege then null; end;
 begin perform public.confirm_shipment_received(ready_id); raise exception 'Customer confirmed a shipment before dispatch'; exception when check_violation then null; end;
 begin perform 1 from private.shipment_delivery_confirmations; raise exception 'Customer read private delivery audit'; exception when insufficient_privilege then null; end;
 first_result:=public.confirm_shipment_received(mine);
 second_result:=public.confirm_shipment_received(mine);
 if first_result.status<>'delivered' or second_result.status<>'delivered' then raise exception 'Customer confirmation did not deliver shipment'; end if;
 if (select status from public.orders where id='d2000000-0000-4000-8000-000000000001')<>'completed' then raise exception 'Customer delivery did not complete order'; end if;
 if (select delivered_at from public.shipments where id=mine) is null then raise exception 'Customer delivery did not timestamp shipment'; end if;
 if (select courier from public.shipments where id=mine) is distinct from before_courier or (select service from public.shipments where id=mine) is distinct from before_service or (select tracking_number from public.shipments where id=mine) is distinct from before_tracking or (select shipped_at from public.shipments where id=mine) is distinct from before_shipped then raise exception 'Customer delivery rewrote protected shipment data'; end if;
 perform set_config('app.delivery_customer_shipment',mine::text,false);
end $$;
reset role;

-- Neither assigned nor unassigned vendors, nor perfumers, may deliver.
set local role authenticated;
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000004',true);
do $$ begin
 perform public.fulfill_shipment((select id from public.shipments where order_id='d2000000-0000-4000-8000-000000000002'),'deliver','','',''); raise exception 'Assigned vendor delivered shipment';
 exception when insufficient_privilege then null;
end $$;
do $$ begin perform 1 from private.shipment_delivery_confirmations; raise exception 'Vendor read private delivery audit'; exception when insufficient_privilege then null; end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000005',true);
do $$ begin perform public.fulfill_shipment((select id from public.shipments where order_id='d2000000-0000-4000-8000-000000000002'),'deliver','','',''); raise exception 'Other vendor delivered shipment'; exception when insufficient_privilege then null; end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000006',true);
do $$ begin perform public.fulfill_shipment((select id from public.shipments where order_id='d2000000-0000-4000-8000-000000000002'),'deliver','','',''); raise exception 'Perfumer delivered shipment'; exception when insufficient_privilege then null; end $$;
reset role;

-- Admin confirmation follows the same atomic audited transition.
set local role authenticated;
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000003',true);
do $$ declare shipment_id uuid; result public.shipments; begin
 select id into shipment_id from public.shipments where order_id='d2000000-0000-4000-8000-000000000003';
 result:=public.fulfill_shipment(shipment_id,'deliver','','','');
 if result.status<>'delivered' or (select status from public.orders where id='d2000000-0000-4000-8000-000000000003')<>'completed' then raise exception 'Admin delivery did not complete shipment and order'; end if;
end $$;
reset role;

-- Audit inspection and immutability are evaluated by the privileged harness,
-- never by an application role.
do $$ declare customer_shipment uuid:=current_setting('app.delivery_customer_shipment')::uuid; begin
 if (select count(*) from private.shipment_delivery_confirmations where shipment_id=customer_shipment)<>1 then raise exception 'Customer retry wrote more than one audit record'; end if;
 if not exists(select 1 from private.shipment_delivery_confirmations where shipment_id=customer_shipment and confirmed_by='d1000000-0000-4000-8000-000000000001' and confirmation_source='customer') then raise exception 'Customer delivery audit is incomplete'; end if;
 if not exists(select 1 from private.shipment_delivery_confirmations where order_id='d2000000-0000-4000-8000-000000000003' and confirmed_by='d1000000-0000-4000-8000-000000000003' and confirmation_source='admin') then raise exception 'Admin delivery audit is incomplete'; end if;
 begin update public.shipments set tracking_number='MUTATED' where id=customer_shipment; raise exception 'Delivered shipment changed after confirmation'; exception when check_violation then null; end;
end $$;
select 'PASS: customer/admin delivery confirmation authorization, ownership, atomicity, idempotency, audit, and finality' as result;
rollback;
