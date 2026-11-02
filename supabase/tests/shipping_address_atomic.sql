begin;
insert into auth.users(id,email) values
 ('a7100000-0000-4000-8000-000000000001','shipping-address-a@example.invalid'),
 ('a7100000-0000-4000-8000-000000000002','shipping-address-b@example.invalid');
insert into private.shipping_destination_cache(cache_key,query_normalized,results,expires_at)
 values('0123456789abcdef0123456789abcdef','bandung',
 '[{"id":4866,"label":{"name":"Batununggal, Bandung, Jawa Barat","city":"Bandung","district":"Batununggal","subdistrict":"Cibangkong","province":"Jawa Barat","postal_code":"40273"}}]'::jsonb,
 clock_timestamp()+interval '1 hour');
do $$ begin
 if has_function_privilege('authenticated','public.save_verified_shipping_address(uuid,uuid,jsonb,text,bigint)','execute')
    or has_function_privilege('anon','public.save_verified_shipping_address(uuid,uuid,jsonb,text,bigint)','execute') then
  raise exception 'Verified address RPC exposed to browser';
 end if;
 if not has_function_privilege('service_role','public.save_verified_shipping_address(uuid,uuid,jsonb,text,bigint)','execute') then
  raise exception 'Edge service cannot save verified address';
 end if;
end $$;
set local role service_role;
do $$ declare a uuid:='a7200000-0000-4000-8000-000000000001'; b uuid:='a7200000-0000-4000-8000-000000000002'; v jsonb; begin
 v:='{"recipient_name":"Test","phone":"0812","address_line":"Jalan Test","label":"Rumah","is_default":true,"city":"FORGED"}'::jsonb;
 perform public.save_verified_shipping_address('a7100000-0000-4000-8000-000000000001',a,v,'0123456789abcdef0123456789abcdef',4866);
 if not exists(select 1 from public.addresses where id=a and user_id='a7100000-0000-4000-8000-000000000001' and city='Bandung' and province='Jawa Barat' and postal_code='40273' and district='Cibangkong, Batununggal' and rajaongkir_destination_id=4866 and rajaongkir_destination_label->>'subdistrict'='Cibangkong' and rajaongkir_destination_label->>'district'='Batununggal' and is_default) then
  raise exception 'Canonical address was not saved atomically';
 end if;
 begin
  perform public.save_verified_shipping_address('a7100000-0000-4000-8000-000000000002',a,v,'0123456789abcdef0123456789abcdef',4866);
  raise exception 'Foreign ID accepted';
 exception when insufficient_privilege then null; end;
 begin
  perform public.save_verified_shipping_address('a7100000-0000-4000-8000-000000000001',b,v,'0123456789abcdef0123456789abcdef',999999);
  raise exception 'Forged destination accepted';
 exception when check_violation then null; end;
 if exists(select 1 from public.addresses where id=b) or not exists(select 1 from public.addresses where id=a and is_default) then
  raise exception 'Failed save caused partial address/default change';
 end if;
 perform public.save_verified_shipping_address('a7100000-0000-4000-8000-000000000001',b,v,'0123456789abcdef0123456789abcdef',4866);
 if (select count(*) from public.addresses where user_id='a7100000-0000-4000-8000-000000000001' and is_default)<>1 or not exists(select 1 from public.addresses where id=b and is_default) then
  raise exception 'Default switching failed';
 end if;
 -- Legacy clients bind after an ordinary address save; all region fields must
 -- change together with the verified label and ID, not remain mismatched.
 perform public.bind_address_shipping_destination('a7100000-0000-4000-8000-000000000001',b,26027,'{"name":"Dauh Puri","city":"Denpasar","district":"Denpasar Barat","subdistrict":"Dauh Puri","province":"Bali","postal_code":"80113"}');
 if not exists(select 1 from public.addresses where id=b and city='Denpasar' and district='Dauh Puri, Denpasar Barat' and province='Bali' and postal_code='80113' and rajaongkir_destination_id=26027 and rajaongkir_destination_label->>'subdistrict'='Dauh Puri' and rajaongkir_destination_label->>'district'='Denpasar Barat') then
  raise exception 'Legacy destination bind left inconsistent region';
 end if;
 begin
  perform public.bind_address_shipping_destination('a7100000-0000-4000-8000-000000000001',b,77,'{"name":"Incomplete"}');
  raise exception 'Incomplete legacy destination accepted';
 exception when check_violation then null; end;
 if not exists(select 1 from public.addresses where id=b and city='Denpasar' and rajaongkir_destination_id=26027) then
  raise exception 'Rejected legacy destination changed the address';
 end if;
end $$;
reset role;
do $$ begin
 if private.shipping_destination_district('{"district":"Tigaraksa","subdistrict":"TIGARAKSA"}'::jsonb)<>'Tigaraksa'
    or private.shipping_destination_district('{"subdistrict":"Dauh Puri"}'::jsonb)<>'Dauh Puri'
    or private.shipping_destination_district('{"district":"Batununggal"}'::jsonb)<>'Batununggal' then
  raise exception 'District/subdistrict deduplication or missing-field handling failed';
 end if;
 begin
  perform private.shipping_destination_district(jsonb_build_object('district',repeat('x',161)));
  raise exception 'Overlong district accepted';
 exception when check_violation then null; end;
end $$;
update private.shipping_feature_settings set enabled=false where singleton=true;
set local role authenticated;
select set_config('request.jwt.claim.sub','a7100000-0000-4000-8000-000000000001',true);
do $$ declare review jsonb; begin
 review:=public.quote_order('a7200000-0000-4000-8000-000000000001','[{"product_id":"10ml","quantity":1,"formulas":[{"top":"yuzu","middle":"matcha","base":"vanilla"}]}]',null);
 if review->'address_snapshot'->>'district'<>'Cibangkong, Batununggal' then
  raise exception 'Checkout snapshot omitted verified kelurahan or kecamatan';
 end if;
end $$;
reset role;
update private.shipping_destination_cache set created_at=clock_timestamp()-interval '2 hours',expires_at=clock_timestamp()-interval '1 hour' where cache_key='0123456789abcdef0123456789abcdef';
set local role service_role;
do $$ begin
 begin
  perform public.save_verified_shipping_address('a7100000-0000-4000-8000-000000000001','a7200000-0000-4000-8000-000000000003','{"recipient_name":"Test","phone":"0812","address_line":"Street","label":"Home"}'::jsonb,'0123456789abcdef0123456789abcdef',4866);
  raise exception 'Expired cache accepted';
 exception when check_violation then null; end;
 if exists(select 1 from public.addresses where id='a7200000-0000-4000-8000-000000000003') then raise exception 'Expired save left partial address'; end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','a7100000-0000-4000-8000-000000000001',true);
do $$ begin
 begin
  perform public.save_verified_shipping_address('a7100000-0000-4000-8000-000000000001','a7200000-0000-4000-8000-000000000001','{}','0123456789abcdef0123456789abcdef',4866);
  raise exception 'Authenticated caller forged binding';
 exception when insufficient_privilege then null; end;
 update public.addresses set city='Other city' where id='a7200000-0000-4000-8000-000000000001';
 if exists(select 1 from public.addresses where id='a7200000-0000-4000-8000-000000000001' and (rajaongkir_destination_id is not null or rajaongkir_destination_label<>'{}'::jsonb or rajaongkir_destination_verified_at is not null)) then
  raise exception 'Manual region edit preserved stale destination';
 end if;
end $$;
reset role;
rollback;
select 'PASS: atomic address save, cache verification, ownership and stale-binding invalidation' as result;
