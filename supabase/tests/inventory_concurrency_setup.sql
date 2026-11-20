insert into auth.users(id,email) values
 ('i1000000-0000-4000-8000-000000000001','inventory-race-one@example.invalid'),
 ('i1000000-0000-4000-8000-000000000002','inventory-race-two@example.invalid');
update public.products set stock_on_hand=1,stock_reserved=0,stock_sold=0,stock_tracking_enabled=true where id='10ml';
insert into public.orders(id,order_number,user_id,request_id,request_payload,address_snapshot,subtotal,discount,shipping,grand_total)
values
 ('i2000000-0000-4000-8000-000000000001','INV-RACE-ONE','i1000000-0000-4000-8000-000000000001',gen_random_uuid(),'{}','{"recipient_name":"Race One"}',100000,0,0,100000),
 ('i2000000-0000-4000-8000-000000000002','INV-RACE-TWO','i1000000-0000-4000-8000-000000000002',gen_random_uuid(),'{}','{"recipient_name":"Race Two"}',100000,0,0,100000);
