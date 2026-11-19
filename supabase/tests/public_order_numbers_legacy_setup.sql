-- This fixture is loaded before the public-order-number migration in the
-- ephemeral CI database, so it represents an order that already existed.
insert into auth.users(id, email) values
  ('b0400000-0000-4000-8000-000000000001', 'legacy-public-order@example.invalid');

insert into public.orders(
  id,
  order_number,
  user_id,
  request_id,
  request_payload,
  address_snapshot,
  subtotal,
  discount,
  shipping,
  grand_total,
  created_at
) values (
  'b0500000-0000-4000-8000-000000000001',
  'INTERNAL-LEGACY-ONE',
  'b0400000-0000-4000-8000-000000000001',
  'b0600000-0000-4000-8000-000000000001',
  '{}', '{}', 100000, 0, 0, 100000, '2026-11-18 00:00:00+00'
);
