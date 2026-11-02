update private.shipping_feature_settings set enabled = true;
-- The Auth trigger normally creates this profile with the customer role. Keep
-- the test setup explicit so an Auth-runtime change fails early instead of
-- accidentally exercising a privileged account.
update public.profiles set role = 'customer' where id = :'customer_id'::uuid;
update private.shipping_origin_settings
set status = 'active',
    origin_destination_id = 73357,
    origin_destination_label = '{"name":"Tigaraksa","city":"Tangerang","district":"Tigaraksa","subdistrict":"Tigaraksa","province":"Banten","postal_code":"15720"}'::jsonb,
    version = version + 1,
    verified_at = clock_timestamp(),
    verified_by = :'customer_id'::uuid,
    updated_by = :'customer_id'::uuid;

insert into public.addresses (
  id, user_id, recipient_name, phone, address_line, city, province, district,
  postal_code, label, is_default, rajaongkir_destination_id,
  rajaongkir_destination_label, rajaongkir_destination_verified_at
) values (
  'e2000000-0000-4000-8000-000000000001', :'customer_id'::uuid,
  'Alamat Lama', '081200000000', 'Jalan Manual No. 1', 'Kota Manual',
  'Provinsi Manual', 'Kecamatan Manual', '11111', 'Rumah', true, 4866,
  '{"name":"Cibangkong","city":"Bandung","district":"Batununggal","subdistrict":"Cibangkong","province":"Jawa Barat","postal_code":"40273"}'::jsonb,
  clock_timestamp()
);
