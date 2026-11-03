begin;
insert into auth.users(id,email) values ('a8100000-0000-4000-8000-000000000001','shipping-consistency@example.invalid');
insert into private.shipping_destination_cache(cache_key,query_normalized,results,expires_at) values
 ('1234567890abcdef1234567890abcdef','bandung','[{"id":4866,"label":{"name":"Cibangkong","city":"Bandung","province":"Jawa Barat","district":"Batununggal","subdistrict":"Cibangkong","postal_code":"40273"}}]'::jsonb,clock_timestamp()+interval '1 hour');
set local role service_role;
select public.save_verified_shipping_address('a8100000-0000-4000-8000-000000000001','a8200000-0000-4000-8000-000000000001','{"recipient_name":"Test","phone":"0812","address_line":"Jalan Test RT 01","label":"Rumah","is_default":true}'::jsonb,'1234567890abcdef1234567890abcdef',4866);
reset role;
do $$ declare a public.addresses; label jsonb; begin
 select * into a from public.addresses where id='a8200000-0000-4000-8000-000000000001';
 label:=a.rajaongkir_destination_label;
 if not private.shipping_address_is_consistent(a) then raise exception 'New canonical address rejected'; end if;
 a.city:='wrong'; if private.shipping_address_region_matches(a,label) then raise exception 'City mismatch accepted'; end if; a.city:=' BANDUNG ';
 a.province:='wrong'; if private.shipping_address_region_matches(a,label) then raise exception 'Province mismatch accepted'; end if; a.province:=' JAWA BARAT ';
 a.district:='wrong'; if private.shipping_address_region_matches(a,label) then raise exception 'District mismatch accepted'; end if; a.district:=' CIBANGKONG, BATUNUNGGAL ';
 a.postal_code:='wrong'; if private.shipping_address_region_matches(a,label) then raise exception 'Postal code mismatch accepted'; end if; a.postal_code:=' 40273 ';
 if not private.shipping_address_region_matches(a,label) then raise exception 'Case and whitespace normalization differs'; end if;
 if private.shipping_address_region_matches(a,label-'name') then raise exception 'Incomplete label accepted'; end if;
end $$;
update private.shipping_feature_settings set enabled=true;
update private.shipping_origin_settings set status='active',origin_destination_id=73357,origin_destination_label='{"name":"Origin","province":"Banten"}',verified_at=clock_timestamp(),verified_by='a8100000-0000-4000-8000-000000000001',updated_by='a8100000-0000-4000-8000-000000000001';
set local role service_role;
do $$ declare q jsonb; items jsonb:='[{"product_id":"10ml","quantity":1,"formulas":[{"top":"yuzu","middle":"matcha","base":"vanilla"}]}]'; begin
 -- Newly confirmed address is valid and can obtain a provider-derived quote.
 perform public.shipping_quote_context('a8100000-0000-4000-8000-000000000001','a8200000-0000-4000-8000-000000000001');
 q:=public.create_shipping_quote('a8100000-0000-4000-8000-000000000001','a8200000-0000-4000-8000-000000000001',items,'jnt','J&T','EZ',18000,'2 days','indonesia-province-v1','java','java');
 perform set_config('app.consistency_quote',q->>'quote_id',true);
end $$;
reset role;
-- Simulate a previously persisted, inconsistent legacy address and its old quote.
update public.addresses set city='Other City',rajaongkir_destination_verified_at=clock_timestamp()+interval '1 second' where id='a8200000-0000-4000-8000-000000000001';
update private.shipping_quotes q set address_fingerprint=private.shipping_digest(to_jsonb(a)) from public.addresses a where q.id=current_setting('app.consistency_quote')::uuid and a.id=q.address_id;
set local role service_role;
do $$ begin
 begin perform public.shipping_quote_context('a8100000-0000-4000-8000-000000000001','a8200000-0000-4000-8000-000000000001'); raise exception 'Inconsistent quote context accepted'; exception when check_violation then null; end;
 begin perform public.bind_address_shipping_destination('a8100000-0000-4000-8000-000000000001','a8200000-0000-4000-8000-000000000001',4866,'{"name":"Cibangkong","city":"Bandung","province":"Jawa Barat","district":"Batununggal","subdistrict":"Cibangkong","postal_code":"40273"}'); raise exception 'Inconsistent legacy binding accepted'; exception when check_violation then null; end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','a8100000-0000-4000-8000-000000000001',true);
do $$ declare items jsonb:='[{"product_id":"10ml","quantity":1,"formulas":[{"top":"yuzu","middle":"matcha","base":"vanilla"}]}]'; begin
 begin perform public.quote_order('a8200000-0000-4000-8000-000000000001',items,current_setting('app.consistency_quote')::uuid); raise exception 'Inconsistent review accepted'; exception when check_violation then null; end;
 begin perform public.place_order('a8200000-0000-4000-8000-000000000001',items,current_setting('app.consistency_quote')::uuid,'a8300000-0000-4000-8000-000000000001','old-token'); raise exception 'Inconsistent checkout accepted'; exception when check_violation then null; end;
end $$;
reset role;
do $$ begin
 if not exists(select 1 from public.addresses where id='a8200000-0000-4000-8000-000000000001' and city='Other City' and recipient_name='Test' and phone='0812' and address_line='Jalan Test RT 01' and label='Rumah') then raise exception 'Rejected mismatch changed saved customer data'; end if;
end $$;
set local role service_role;
-- Explicit confirmation re-saves the trusted location atomically.
select public.save_verified_shipping_address('a8100000-0000-4000-8000-000000000001','a8200000-0000-4000-8000-000000000001','{"recipient_name":"Test","phone":"0812","address_line":"Jalan Test RT 01","label":"Rumah","is_default":true}'::jsonb,'1234567890abcdef1234567890abcdef',4866);
do $$ declare q jsonb; items jsonb:='[{"product_id":"10ml","quantity":1,"formulas":[{"top":"yuzu","middle":"matcha","base":"vanilla"}]}]'; begin
 q:=public.create_shipping_quote('a8100000-0000-4000-8000-000000000001','a8200000-0000-4000-8000-000000000001',items,'jnt','J&T','EZ',18000,'2 days','indonesia-province-v1','java','java');
 perform set_config('app.confirmed_quote',q->>'quote_id',true);
end $$;
reset role;
set local role authenticated;
do $$ declare items jsonb:='[{"product_id":"10ml","quantity":1,"formulas":[{"top":"yuzu","middle":"matcha","base":"vanilla"}]}]'; review jsonb; order_id uuid; retry_id uuid; begin
 review:=public.quote_order('a8200000-0000-4000-8000-000000000001',items,current_setting('app.confirmed_quote')::uuid);
 if review->'address_snapshot'->>'city'<>'Bandung' or review->'address_snapshot'->>'district'<>'Cibangkong, Batununggal' or (review->>'shipping')::bigint<>13000 then raise exception 'Confirmed snapshot or voucher incorrect'; end if;
 order_id:=(public.place_order('a8200000-0000-4000-8000-000000000001',items,current_setting('app.confirmed_quote')::uuid,'a8300000-0000-4000-8000-000000000002',review->>'quote_token')->>'order_id')::uuid;
 if not exists(select 1 from public.orders where id=order_id and address_snapshot->>'city'='Bandung' and address_snapshot->>'district'='Cibangkong, Batununggal') then raise exception 'Fulfillment snapshot not canonical'; end if;
 update public.addresses set city='Changed after order' where id='a8200000-0000-4000-8000-000000000001';
 retry_id:=(public.place_order('a8200000-0000-4000-8000-000000000001',items,current_setting('app.confirmed_quote')::uuid,'a8300000-0000-4000-8000-000000000002',review->>'quote_token')->>'order_id')::uuid;
 if order_id<>retry_id then raise exception 'Confirmed checkout is not idempotent'; end if;
end $$;
reset role;
rollback;
select 'PASS: legacy mismatch, quote/checkout rejection, explicit confirmation and idempotency' as result;
