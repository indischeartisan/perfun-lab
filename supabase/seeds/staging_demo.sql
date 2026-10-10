-- Perfun Lab staging-only demonstration fixture.
-- Run only through the documented staging command. This seed is idempotent and
-- deliberately requires two session settings that are never set by migrations.
-- A privileged database operator can always override a session guard; this is
-- an accidental-production safety barrier, not a substitute for isolated credentials.

begin;

do $$
begin
  if current_setting('perfun.seed_environment', true) is distinct from 'staging'
    or current_setting('perfun.seed_confirmation', true) is distinct from 'PERFUN_STAGING_DEMO_ONLY' then
    raise exception 'Refusing demo seed: staging session confirmation is required' using errcode='42501';
  end if;
end $$;

-- The password is supplied by psql as a session setting and is never stored in
-- this repository. Use a unique throwaway value for staging only.
do $$
declare password_value text:=current_setting('perfun.demo_password', true);
begin
  if length(coalesce(password_value,'')) < 16 then
    raise exception 'Refusing demo seed: a unique staging-only demo password is required' using errcode='42501';
  end if;
  insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values
   ('6a100000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','demo-customer@staging.invalid',crypt(password_value,gen_salt('bf')),clock_timestamp(),'{"provider":"email","providers":["email"]}','{}',clock_timestamp(),clock_timestamp()),
   ('6a100000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','demo-admin@staging.invalid',crypt(password_value,gen_salt('bf')),clock_timestamp(),'{"provider":"email","providers":["email"]}','{}',clock_timestamp(),clock_timestamp()),
   ('6a100000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','demo-vendor-a@staging.invalid',crypt(password_value,gen_salt('bf')),clock_timestamp(),'{"provider":"email","providers":["email"]}','{}',clock_timestamp(),clock_timestamp()),
   ('6a100000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','demo-vendor-b@staging.invalid',crypt(password_value,gen_salt('bf')),clock_timestamp(),'{"provider":"email","providers":["email"]}','{}',clock_timestamp(),clock_timestamp())
  on conflict(id) do update set email=excluded.email,encrypted_password=excluded.encrypted_password,email_confirmed_at=excluded.email_confirmed_at,updated_at=clock_timestamp();
end $$;

update public.profiles set role='admin',full_name='Demo Admin' where id='6a100000-0000-4000-8000-000000000002';
update public.profiles set role='vendor',full_name='Demo Vendor A' where id='6a100000-0000-4000-8000-000000000003';
update public.profiles set role='vendor',full_name='Demo Vendor B' where id='6a100000-0000-4000-8000-000000000004';
update public.profiles set role='customer',full_name='Demo Customer' where id='6a100000-0000-4000-8000-000000000001';

insert into public.addresses(id,user_id,recipient_name,phone,address_line,district,city,province,postal_code,label,is_default,delivery_note)
values ('6a200000-0000-4000-8000-000000000001','6a100000-0000-4000-8000-000000000001','Rani Demo','081200000000','Jl. Melati Fiktif No. 10','Kecamatan Contoh','Bandung','Jawa Barat','40111','Demo Home',true,'Alamat fiktif untuk review staging.')
on conflict(id) do update set recipient_name=excluded.recipient_name,phone=excluded.phone,address_line=excluded.address_line,district=excluded.district,city=excluded.city,province=excluded.province,postal_code=excluded.postal_code,delivery_note=excluded.delivery_note;

-- These immutable snapshots exercise 10 ml, 30 ml, and Play Set dashboard paths.
insert into public.orders(id,order_number,user_id,request_id,request_payload,address_snapshot,subtotal,discount,shipping,grand_total,payment_status,status,shipping_quote_snapshot)
values
 ('6a300000-0000-4000-8000-000000000001','STG-10ML-PRODUCTION','6a100000-0000-4000-8000-000000000001','6a400000-0000-4000-8000-000000000001','{}','{"recipient_name":"Rani Demo","phone":"081200000000","address_line":"Jl. Melati Fiktif No. 10","district":"Kecamatan Contoh","city":"Bandung","province":"Jawa Barat","postal_code":"40111"}',109000,0,18000,127000,'paid','paid','{"quote_id":"staging-demo-10ml","courier_name":"JNE","service":"REG","amount":18000}'),
 ('6a300000-0000-4000-8000-000000000002','STG-30ML-PACKING','6a100000-0000-4000-8000-000000000001','6a400000-0000-4000-8000-000000000002','{}','{"recipient_name":"Rani Demo","phone":"081200000000","address_line":"Jl. Melati Fiktif No. 10","district":"Kecamatan Contoh","city":"Bandung","province":"Jawa Barat","postal_code":"40111"}',199000,0,22000,221000,'paid','paid','{"quote_id":"staging-demo-30ml","courier_name":"J&T","service":"EZ","amount":22000}'),
 ('6a300000-0000-4000-8000-000000000003','STG-PLAYSET-PAYOUT','6a100000-0000-4000-8000-000000000001','6a400000-0000-4000-8000-000000000003','{}','{"recipient_name":"Rani Demo","phone":"081200000000","address_line":"Jl. Melati Fiktif No. 10","district":"Kecamatan Contoh","city":"Bandung","province":"Jawa Barat","postal_code":"40111"}',598000,0,25000,623000,'paid','paid','{"quote_id":"staging-demo-playset","courier_name":"SiCepat","service":"BEST","amount":25000}')
on conflict(order_number) do update set address_snapshot=excluded.address_snapshot,shipping_quote_snapshot=excluded.shipping_quote_snapshot;

insert into public.order_items(id,order_id,position,product_snapshot,creations_snapshot,quantity,normal_unit_price,unit_price,line_total)
values
 ('6a500000-0000-4000-8000-000000000001','6a300000-0000-4000-8000-000000000001',1,'{"id":"10ml","label":"10 ML","volume_ml":10,"bottle_count":1}','[{"name":"Citrus Lab","notes":[{"phase":"top","note":{"name":"Yuzu"}},{"phase":"middle","note":{"name":"Matcha"}},{"phase":"base","note":{"name":"Vanilla"}}]}]',1,129000,109000,109000),
 ('6a500000-0000-4000-8000-000000000002','6a300000-0000-4000-8000-000000000002',1,'{"id":"30ml","label":"30 ML","volume_ml":30,"bottle_count":1}','[{"name":"Floral Lab","notes":[{"phase":"top","note":{"name":"Yuzu"}},{"phase":"middle","note":{"name":"Matcha"}},{"phase":"base","note":{"name":"Vanilla"}}]}]',1,229000,199000,199000),
 ('6a500000-0000-4000-8000-000000000003','6a300000-0000-4000-8000-000000000003',1,'{"id":"bundle-3x10ml","label":"Play Set","volume_ml":10,"bottle_count":3}','[{"name":"Set One","notes":[{"phase":"top","note":{"name":"Yuzu"}},{"phase":"middle","note":{"name":"Matcha"}},{"phase":"base","note":{"name":"Vanilla"}}]},{"name":"Set Two","notes":[{"phase":"top","note":{"name":"Soapy"}},{"phase":"middle","note":{"name":"Matcha"}},{"phase":"base","note":{"name":"Vanilla"}}]},{"name":"Set Three","notes":[{"phase":"top","note":{"name":"Yuzu"}},{"phase":"middle","note":{"name":"Soapy"}},{"phase":"base","note":{"name":"Vanilla"}}]}]',2,299000,299000,598000)
on conflict(order_id,position) do update set product_snapshot=excluded.product_snapshot,creations_snapshot=excluded.creations_snapshot,quantity=excluded.quantity;

select set_config('request.jwt.claim.sub','6a100000-0000-4000-8000-000000000002',true);
select public.admin_assign_vendor('6a300000-0000-4000-8000-000000000001','6a100000-0000-4000-8000-000000000003');
select public.admin_assign_vendor('6a300000-0000-4000-8000-000000000002','6a100000-0000-4000-8000-000000000003');
select public.admin_assign_vendor('6a300000-0000-4000-8000-000000000003','6a100000-0000-4000-8000-000000000003');

-- The remaining status transitions are intentionally performed through the
-- production/packing/fulfillment RPCs during the staging review, preserving
-- the same authorization and lifecycle checks as the browser.
commit;
