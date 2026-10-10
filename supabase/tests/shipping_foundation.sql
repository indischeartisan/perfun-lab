begin;
insert into auth.users(id,email) values
 ('ab100000-0000-4000-8000-000000000001','shipping-foundation-customer@example.invalid'),
 ('ab100000-0000-4000-8000-000000000002','shipping-foundation-other@example.invalid'),
 ('ab100000-0000-4000-8000-000000000003','shipping-foundation-admin@example.invalid'),
 ('ab100000-0000-4000-8000-000000000004','shipping-foundation-vendor@example.invalid');
update public.profiles set role='admin' where id='ab100000-0000-4000-8000-000000000003';
update public.profiles set role='vendor' where id='ab100000-0000-4000-8000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000001',true);
select public.save_address('ab200000-0000-4000-8000-000000000001','{"recipient_name":"Customer","phone":"0812","address_line":"Street","city":"Tangerang","province":"Banten","postal_code":"15720","label":"Home"}');
reset role;
set local role service_role;
select public.bind_address_shipping_destination('ab100000-0000-4000-8000-000000000001','ab200000-0000-4000-8000-000000000001',12345,'{"name":"Tigaraksa"}');
do $$ declare result jsonb; begin
 result:=public.shipping_weight_for_items('[{"product_id":"10ml","quantity":2},{"product_id":"30ml","quantity":1},{"product_id":"bundle-3x10ml","quantity":2}]');
 if (result->>'weight_grams')::integer<>2300 or result->>'package_profile_version'<>'1' then raise exception 'Weight calculation failed: %',result; end if;
 begin perform public.shipping_weight_for_items('[{"product_id":"unknown","quantity":1}]'); raise exception 'Unknown product accepted'; exception when check_violation then null; end;
end $$;
-- Feature is default-off; activating only the feature still fails closed until a verified origin exists.
update private.shipping_feature_settings set enabled=true;
do $$ begin
 begin perform public.shipping_quote_context('ab100000-0000-4000-8000-000000000001','ab200000-0000-4000-8000-000000000001'); raise exception 'Inactive origin accepted'; exception when check_violation then null; end;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000001',true);
do $$ begin
 begin perform public.admin_set_shipping_feature_enabled(true); raise exception 'Customer enabled shipping'; exception when insufficient_privilege then null; end;
end $$;
reset role;
update private.shipping_origin_settings set status='active',origin_destination_id=999,origin_destination_label='{"name":"Verified Origin"}',verified_at=clock_timestamp(),verified_by='ab100000-0000-4000-8000-000000000003',updated_by='ab100000-0000-4000-8000-000000000003';
set local role service_role;
do $$ declare quote jsonb; begin
 quote:=public.create_shipping_quote('ab100000-0000-4000-8000-000000000001','ab200000-0000-4000-8000-000000000001','[{"product_id":"10ml","quantity":1}]','jne','JNE','REG',18000,'2 days');
 if quote->>'quote_id' is null or (quote->>'weight_grams')::integer<>500 then raise exception 'Quote snapshot failed'; end if;
 perform set_config('app.shipping_quote_id',quote->>'quote_id',false);
 begin perform public.bind_address_shipping_destination('ab100000-0000-4000-8000-000000000002','ab200000-0000-4000-8000-000000000001',12345,'{"name":"forged"}'); raise exception 'Other user bound address'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000002',true);
do $$ declare quote_id uuid; begin
 quote_id:=current_setting('app.shipping_quote_id')::uuid;
 begin perform public.get_shipping_quote(quote_id); raise exception 'Other customer read quote'; exception when insufficient_privilege then null; end;
 begin perform public.admin_activate_shipping_origin(999,'{"name":"forged"}'); raise exception 'Customer activated origin'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000004',true);
do $$ declare quote_id uuid; begin
 quote_id:=current_setting('app.shipping_quote_id')::uuid;
 begin perform public.get_shipping_quote(quote_id); raise exception 'Vendor read customer quote'; exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Exact 10-minute expiry is enforced by the DB constraint and read path.
do $$ begin
 update private.shipping_quotes set created_at=clock_timestamp()-interval '11 minutes',expires_at=clock_timestamp()-interval '2 minutes';
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000001',true);
do $$ declare quote_id uuid; begin
 quote_id:=current_setting('app.shipping_quote_id')::uuid;
 begin perform public.get_shipping_quote(quote_id); raise exception 'Expired quote was returned'; exception when insufficient_privilege then null; end;
 begin update public.addresses set rajaongkir_destination_id=1 where id='ab200000-0000-4000-8000-000000000001'; raise exception 'Customer forged destination ID'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS: shipping weights, inactive origin, server-only destinations, quote isolation and expiry' as result;
rollback;
