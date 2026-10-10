begin;
insert into auth.users(id,email) values ('f5100000-0000-4000-8000-000000000001','shipping-checkout@example.invalid'),('f5100000-0000-4000-8000-000000000002','shipping-checkout-other@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub','f5100000-0000-4000-8000-000000000001',true);
select public.save_address('f5200000-0000-4000-8000-000000000001','{"recipient_name":"Checkout","phone":"0812","address_line":"Street","city":"Tangerang","province":"Banten","postal_code":"15720","label":"Home"}');
reset role;
update private.shipping_feature_settings set enabled=true;
update private.shipping_origin_settings set status='active',origin_destination_id=991,origin_destination_label='{"name":"Origin"}',version=2,verified_at=clock_timestamp(),verified_by='f5100000-0000-4000-8000-000000000001',updated_by='f5100000-0000-4000-8000-000000000001';
select public.bind_address_shipping_destination('f5100000-0000-4000-8000-000000000001','f5200000-0000-4000-8000-000000000001',992,'{"name":"Destination"}');
set local role service_role;
do $$ declare q jsonb; items jsonb:='[{"product_id":"10ml","quantity":1,"formulas":[{"top":"yuzu","middle":"matcha","base":"vanilla"}]}]'; begin
 q:=public.create_shipping_quote('f5100000-0000-4000-8000-000000000001','f5200000-0000-4000-8000-000000000001',items,'jne','JNE','REG',18000,'2 days'); perform set_config('app.shipping_checkout_quote',q->>'quote_id',false); perform set_config('app.shipping_checkout_items',items::text,false);
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','f5100000-0000-4000-8000-000000000001',true);
do $$ declare items jsonb:=current_setting('app.shipping_checkout_items')::jsonb; qid uuid:=current_setting('app.shipping_checkout_quote')::uuid; reviewed jsonb; oid uuid; retry uuid; payment jsonb; begin
 reviewed:=public.quote_order('f5200000-0000-4000-8000-000000000001',items,qid);
 if (reviewed->>'shipping')::bigint<>18000 or (reviewed->>'grand_total')::bigint<>127000 then raise exception 'Shipping total was not server calculated: %',reviewed; end if;
 oid:=(public.place_order('f5200000-0000-4000-8000-000000000001',items,qid,'f5300000-0000-4000-8000-000000000001',reviewed->>'quote_token')->>'order_id')::uuid;
 retry:=(public.place_order('f5200000-0000-4000-8000-000000000001',items,qid,'f5300000-0000-4000-8000-000000000001',reviewed->>'quote_token')->>'order_id')::uuid;
 if oid<>retry or (select shipping from public.orders where id=oid)<>18000 or (select shipping_quote_snapshot->>'service' from public.orders where id=oid)<>'REG' then raise exception 'Shipping order/idempotency snapshot failed'; end if;
 perform set_config('app.shipping_checkout_order',oid::text,false);
 begin perform public.quote_order('f5200000-0000-4000-8000-000000000001','[{"product_id":"30ml","quantity":1,"formulas":[{"top":"soapy","middle":"peony","base":"amber"}]}]',qid); raise exception 'Item mismatch accepted'; exception when check_violation then null; end;
end $$;
reset role;
set local role service_role;
do $$ declare payment jsonb; begin
 payment:=public.reserve_payment(current_setting('app.shipping_checkout_order')::uuid,'f5100000-0000-4000-8000-000000000001','doku','sandbox','https://example.invalid');
 if (payment->>'amount')::bigint<>(select grand_total from public.orders where id=current_setting('app.shipping_checkout_order')::uuid) then raise exception 'DOKU amount did not use final total'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','f5100000-0000-4000-8000-000000000002',true);
do $$ begin
 begin perform public.get_shipping_quote(current_setting('app.shipping_checkout_quote')::uuid); raise exception 'Foreign quote exposed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS: checkout locks owned quote, includes shipping in DOKU amount, and preserves idempotency' as result;
rollback;
