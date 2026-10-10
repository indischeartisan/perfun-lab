-- Live integration test, entirely rolled back. Does not send emails or touch real customers.
begin;
\ir checkout_test_helpers.sql
insert into auth.users(id,email) values ('c1000000-0000-4000-8000-000000000001','checkout-a@example.invalid'),('c1000000-0000-4000-8000-000000000002','checkout-b@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
select public.save_address('c3000000-0000-4000-8000-000000000001','{"recipient_name":"Customer A","phone":"081234567890","address_line":"Original street","city":"Bandung","province":"Jawa Barat","postal_code":"40111","label":"Home","is_default":true}');
select public.save_address('c3000000-0000-4000-8000-000000000002','{"recipient_name":"Customer A","phone":"081234567890","address_line":"Office street","city":"Bandung","province":"Jawa Barat","postal_code":"40111","label":"Office","is_default":true}');
do $$ declare items jsonb; q jsonb; o uuid; retry uuid; begin
 if (select count(*) from public.addresses where is_default)<>1 then raise exception 'Default switching failed'; end if;
 items := '[{"product_id":"10ml","formulas":[{"top":"yuzu","middle":"matcha","base":"vanilla"}],"quantity":2},{"product_id":"30ml","formulas":[{"top":"soapy","middle":"peony","base":"amber"}],"quantity":1},{"product_id":"bundle-3x10ml","formulas":[{"top":"yuzu","middle":"matcha","base":"vanilla"},{"top":"soapy","middle":"peony","base":"amber"},{"top":"mint","middle":"tea","base":"honey"}],"quantity":1}]';
 q := public.quote_order('c3000000-0000-4000-8000-000000000001',items);
 if (q->>'subtotal')::bigint<>786000 or (q->>'discount')::bigint<>70000 or (q->>'shipping')::bigint<>18000 or (q->>'grand_total')::bigint<>734000 then raise exception 'Incorrect totals: %',q; end if;
 o := (public.place_order('c3000000-0000-4000-8000-000000000001',items,'c4000000-0000-4000-8000-000000000001',q->>'quote_token')->>'order_id')::uuid;
 retry := (public.place_order('c3000000-0000-4000-8000-000000000001',items,'c4000000-0000-4000-8000-000000000001',q->>'quote_token')->>'order_id')::uuid;
 if o<>retry or (select count(*) from public.orders)<>1 or (select count(*) from public.order_items)<>3 then raise exception 'Idempotency failed'; end if;
 if (select status from public.orders where id=o)<>'pending_payment' then raise exception 'Wrong status'; end if;
 begin update public.orders set grand_total=1 where id=o; raise exception 'Client can tamper order'; exception when insufficient_privilege then null; end;
 begin update public.order_items set unit_price=1 where order_id=o; raise exception 'Client can tamper items'; exception when insufficient_privilege then null; end;
 begin perform public.quote_order('c3000000-0000-4000-8000-000000000001','[{"product_id":"bundle-3x10ml","formulas":[{"top":"yuzu","middle":"matcha","base":"vanilla"}],"quantity":1}]'); raise exception 'Invalid bundle accepted'; exception when raise_exception or check_violation then if sqlerrm='Invalid bundle accepted' then raise; end if; end;
 begin perform public.quote_order('c3000000-0000-4000-8000-000000000001','[{"product_id":"10ml","formulas":[{"top":"yuzu","middle":"matcha","base":"vanilla"}],"quantity":0}]'); raise exception 'Invalid quantity accepted'; exception when raise_exception or check_violation then if sqlerrm='Invalid quantity accepted' then raise; end if; end;
 -- Address change invalidates a reviewed quote for a NEW request.
 update public.addresses set address_line='Edited street' where id='c3000000-0000-4000-8000-000000000001';
 begin perform public.place_order('c3000000-0000-4000-8000-000000000001',items,'c4000000-0000-4000-8000-000000000002',q->>'quote_token'); raise exception 'Stale quote accepted'; exception when raise_exception or check_violation then if sqlerrm='Stale quote accepted' then raise; end if; end;
 delete from public.addresses where id='c3000000-0000-4000-8000-000000000001';
 retry := (public.place_order('c3000000-0000-4000-8000-000000000001',items,'c4000000-0000-4000-8000-000000000001',q->>'quote_token')->>'order_id')::uuid;
 if o<>retry then raise exception 'Retry after source deletion failed'; end if;
 if (select address_snapshot->>'address_line' from public.orders where id=o)<>'Original street' then raise exception 'Address snapshot changed'; end if;
end $$;
reset role;
update public.notes set name='Edited vanilla' where id='vanilla';
update public.product_prices set amount=100000 where product_id='10ml' and kind='launch';
update public.products set label='Changed size label' where id='10ml';
set local role authenticated;
do $$ begin
 if (select unit_price from public.order_items where position=1)<>109000 then raise exception 'Price snapshot changed'; end if;
 if (select product_snapshot->>'label' from public.order_items where position=1)<>'10 ML' then raise exception 'Product snapshot changed'; end if;
 if (select creations_snapshot->0->'notes'->2->'note'->>'name' from public.order_items where position=1)<>'Vanilla' then raise exception 'Note snapshot changed'; end if;
end $$;
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000002',true);
do $$ begin
 if exists(select 1 from public.orders) or exists(select 1 from public.order_items) or exists(select 1 from public.addresses) then raise exception 'Cross-owner data exposed'; end if;
 begin perform public.quote_order('c3000000-0000-4000-8000-000000000002','[{"product_id":"30ml","formulas":[{"top":"soapy","middle":"peony","base":"amber"}],"quantity":1}]'); raise exception 'Foreign address allowed'; exception when insufficient_privilege then null; end;
end $$;
select public.save_address('c3000000-0000-4000-8000-000000000003','{"recipient_name":"B","phone":"0812","address_line":"B street","city":"Bandung","province":"Jawa Barat","postal_code":"40111","label":"Home"}');
do $$ begin
 perform public.quote_order('c3000000-0000-4000-8000-000000000003','[{"product_id":"30ml","formulas":[{"top":"soapy","middle":"peony","base":"amber"}],"quantity":1}]'); -- Formulas are direct input, not another customer's records.
end $$;
set local role anon;
do $$ begin
 begin perform * from public.orders; raise exception 'Anonymous orders exposed'; exception when insufficient_privilege then null; end;
 begin perform public.quote_order(null,'[]'); raise exception 'Anonymous quote allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set constraints all immediate;
rollback;
select 'PASS: address defaults/CRUD, products, totals, snapshots, immutable orders, RLS, quote validation and idempotent retries' as result;
