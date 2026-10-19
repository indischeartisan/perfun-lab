-- CI disposable database only. This fixture intentionally commits for two sessions.
insert into auth.users(id,email) values
 ('d1000000-0000-4000-8000-000000000001','race-customer@example.invalid'),
 ('d1000000-0000-4000-8000-000000000002','race-admin@example.invalid'),
 ('d1000000-0000-4000-8000-000000000003','race-vendor@example.invalid');
update public.profiles set role='admin' where id='d1000000-0000-4000-8000-000000000002';
update public.profiles set role='vendor' where id='d1000000-0000-4000-8000-000000000003';
insert into public.orders(id,order_number,user_id,request_id,request_payload,address_snapshot,subtotal,discount,shipping,grand_total)
values('d2000000-0000-4000-8000-000000000001','RACE-TEST','d1000000-0000-4000-8000-000000000001',gen_random_uuid(),'{}','{"recipient_name":"Test"}',100000,0,0,100000);
insert into public.order_items(id,order_id,position,product_snapshot,creations_snapshot,quantity,normal_unit_price,unit_price,line_total) values
 ('d3000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001',1,'{"id":"10ml","label":"10 ML","volume_ml":10,"bottle_count":1}','[]',1,50000,50000,50000),
 ('d3000000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-000000000001',2,'{"id":"30ml","label":"30 ML","volume_ml":30,"bottle_count":1}','[]',1,50000,50000,50000);
update public.orders set payment_status='paid',status='paid' where id='d2000000-0000-4000-8000-000000000001';
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000002',true);
select public.admin_assign_vendor('d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000003');
commit;
