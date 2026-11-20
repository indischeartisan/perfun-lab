-- Inventory, mixed format reservation, payment settlement, expiry, and retry.
begin;
\ir checkout_test_helpers.sql
insert into auth.users(id,email) values
 ('b1000000-0000-4000-8000-000000000001','inventory-one@example.invalid'),
 ('b1000000-0000-4000-8000-000000000002','inventory-two@example.invalid');
set local role service_role;
update public.products set stock_on_hand=5,stock_reserved=0,stock_sold=0,stock_tracking_enabled=true where id='10ml';
update public.products set stock_on_hand=1,stock_reserved=0,stock_sold=0,stock_tracking_enabled=true where id='30ml';
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000001',true);
select public.save_address('b3000000-0000-4000-8000-000000000001','{"recipient_name":"Inventory One","phone":"0812000001","address_line":"One Street","city":"Bandung","province":"Jawa Barat","postal_code":"40111","label":"Home"}');
select public.save_address('b3000000-0000-4000-8000-000000000002','{"recipient_name":"Inventory Two","phone":"0812000002","address_line":"Two Street","city":"Bandung","province":"Jawa Barat","postal_code":"40112","label":"Home"}');
do $$ declare items jsonb:='[{"product_id":"10ml","quantity":1,"formulas":[{"top":"yuzu","middle":"matcha","base":"vanilla"}]},{"product_id":"bundle-3x10ml","quantity":1,"formulas":[{"top":"mint","middle":"tea","base":"sandalwood"},{"top":"berries","middle":"jasmine","base":"amber"},{"top":"pink-pepper","middle":"clean-musk","base":"coconut-milk"}]},{"product_id":"30ml","quantity":1,"formulas":[{"top":"soapy","middle":"peony","base":"amber"}]}]; q jsonb; oid uuid; reserved_10 bigint; reserved_30 bigint; reservation_count bigint; begin
 q:=public.quote_order('b3000000-0000-4000-8000-000000000001',items); oid:=(public.place_order('b3000000-0000-4000-8000-000000000001',items,'b4000000-0000-4000-8000-000000000001',q->>'quote_token')->>'order_id')::uuid;
 select stock_reserved into reserved_10 from public.products where id='10ml';
 select stock_reserved into reserved_30 from public.products where id='30ml';
 select count(*) into reservation_count from public.order_inventory_reservations where order_id=oid and status='reserved';
 if reserved_10 <> 4 or reserved_30 <> 1 then raise exception 'Mixed single and Play Set reservation incorrect'; end if;
 if reservation_count <> 2 then raise exception 'Reservation rows missing'; end if;
end $$;
reset role;
set local role service_role;
do $$ declare p jsonb; oid uuid; reserved_10 bigint; sold_10 bigint; reserved_30 bigint; sold_30 bigint; begin
 select id into oid from public.orders where request_id='b4000000-0000-4000-8000-000000000001';
 p:=public.reserve_payment(oid,'b1000000-0000-4000-8000-000000000001','doku','sandbox','https://example.invalid');
 perform public.apply_payment_event((p->>'id')::uuid,'inventory-paid',(p->>'amount')::bigint,'paid',clock_timestamp(),'{}');
 perform public.apply_payment_event((p->>'id')::uuid,'inventory-paid',(p->>'amount')::bigint,'paid',clock_timestamp(),'{}');
 select stock_reserved,stock_sold into reserved_10,sold_10 from public.products where id='10ml';
 select stock_reserved,stock_sold into reserved_30,sold_30 from public.products where id='30ml';
 if reserved_10 <> 0 or sold_10 <> 4 then raise exception 'Paid settlement is not idempotent'; end if;
 if reserved_30 <> 0 or sold_30 <> 1 then raise exception '30 ML paid settlement incorrect'; end if;
end $$;
update public.products set stock_on_hand=8 where id='10ml';
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000002',true);
do $$ declare items jsonb:='[{"product_id":"bundle-3x10ml","quantity":1,"formulas":[{"top":"yuzu","middle":"matcha","base":"vanilla"},{"top":"mint","middle":"tea","base":"sandalwood"},{"top":"pink-pepper","middle":"jasmine","base":"amber"}]}]'; q jsonb; oid uuid; reserved_10 bigint; begin
 q:=public.quote_order('b3000000-0000-4000-8000-000000000002',items); oid:=(public.place_order('b3000000-0000-4000-8000-000000000002',items,'b4000000-0000-4000-8000-000000000002',q->>'quote_token')->>'order_id')::uuid;
 select stock_reserved into reserved_10 from public.products where id='10ml';
 if reserved_10 <> 3 then raise exception 'Play Set did not reserve three 10 ML bottles'; end if;
end $$;
reset role;
set local role service_role;
do $$ declare p jsonb; oid uuid; retry jsonb; reserved_10 bigint; sold_10 bigint; begin
 select id into oid from public.orders where request_id='b4000000-0000-4000-8000-000000000002';
 p:=public.reserve_payment(oid,'b1000000-0000-4000-8000-000000000002','doku','sandbox','https://example.invalid');
 perform public.apply_payment_event((p->>'id')::uuid,'inventory-expired',(p->>'amount')::bigint,'expired',null,'{}');
 select stock_reserved into reserved_10 from public.products where id='10ml';
 if reserved_10 <> 0 then raise exception 'Expired payment did not release reservation'; end if;
 retry:=public.reserve_payment(oid,'b1000000-0000-4000-8000-000000000002','doku','sandbox','https://example.invalid');
 select stock_reserved into reserved_10 from public.products where id='10ml';
 if reserved_10 <> 3 then raise exception 'Payment retry did not reacquire released stock'; end if;
 perform public.apply_payment_event((retry->>'id')::uuid,'inventory-retry-paid',(retry->>'amount')::bigint,'paid',clock_timestamp(),'{}');
 perform public.apply_payment_event((retry->>'id')::uuid,'inventory-retry-paid',(retry->>'amount')::bigint,'paid',clock_timestamp(),'{}');
 select stock_reserved,stock_sold into reserved_10,sold_10 from public.products where id='10ml';
 if reserved_10 <> 0 or sold_10 <> 7 then raise exception 'Retry settlement is not idempotent'; end if;
end $$;
reset role;
rollback;
select 'PASS: mixed single and Play Set reservations, paid/expired/retry settlement, and repeated callbacks' result;
