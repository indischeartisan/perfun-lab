-- Disposable local-only browser fixture. The runner resets and destroys this
-- Supabase stack after the test; no production data or credentials are used.
begin;

insert into auth.users(id, email)
values ('bf100000-0000-4000-8000-000000000001', 'finance-browser-customer@example.invalid');

update public.profiles
set role = 'customer'
where id = 'bf100000-0000-4000-8000-000000000001';

update public.profiles
set role = 'admin'
where id = :'admin_id'::uuid;

insert into public.orders(
  id, order_number, user_id, request_id, request_payload, address_snapshot,
  subtotal, discount, shipping, grand_total, payment_status, status, created_at
)
values
  ('bf200000-0000-4000-8000-000000000001', 'BROWSER-FIN-BOUNDARY', 'bf100000-0000-4000-8000-000000000001', gen_random_uuid(), '{}', '{}', 100000, 10000, 15000, 105000, 'paid', 'paid', '2026-01-01 16:59:59+00'),
  ('bf200000-0000-4000-8000-000000000002', 'BROWSER-FIN-SAME-DAY', 'bf100000-0000-4000-8000-000000000001', gen_random_uuid(), '{}', '{}', 200000, 0, 20000, 220000, 'paid', 'paid', '2026-01-02 02:00:00+00');

insert into public.order_items(
  id, order_id, position, product_snapshot, creations_snapshot, quantity,
  normal_unit_price, unit_price, line_total
)
values
  ('bf300000-0000-4000-8000-000000000001', 'bf200000-0000-4000-8000-000000000001', 1, '{"id":"10ml","label":"10 ML","volume_ml":10,"bottle_count":1}', '[]', 1, 100000, 90000, 90000),
  ('bf300000-0000-4000-8000-000000000002', 'bf200000-0000-4000-8000-000000000002', 1, '{"id":"10ml","label":"10 ML","volume_ml":10,"bottle_count":1}', '[]', 2, 100000, 100000, 200000);

insert into public.payments(
  id, order_id, provider, environment, provider_reference, amount, status,
  paid_at, request_payload, created_at
)
values
  ('bf400000-0000-4000-8000-000000000001', 'bf200000-0000-4000-8000-000000000001', 'test', 'sandbox', 'BROWSER-FIN-1', 105000, 'paid', '2026-01-02 01:00:00+00', '{}', '2026-01-02 01:00:00+00'),
  ('bf400000-0000-4000-8000-000000000002', 'bf200000-0000-4000-8000-000000000002', 'test', 'sandbox', 'BROWSER-FIN-2', 220000, 'paid', '2026-01-02 02:30:00+00', '{}', '2026-01-02 02:30:00+00');

insert into public.vendor_payouts(
  id, vendor_id, payout_date, status, total, transfer_reference, paid_at,
  paid_by, request_id
)
values (
  'bf600000-0000-4000-8000-000000000001', :'admin_id'::uuid, '2026-01-02',
  'paid', 62000, 'BROWSER-FIN-BANK', '2026-01-02 16:00:00+00',
  :'admin_id'::uuid, gen_random_uuid()
);

insert into public.vendor_payout_items(
  payout_id, order_id, vendor_id, vendor_fee_amount, shipping_reimbursement,
  total_amount, status
)
values (
  'bf600000-0000-4000-8000-000000000001',
  'bf200000-0000-4000-8000-000000000001',
  :'admin_id'::uuid, 50000, 12000, 62000, 'paid'
);

commit;
