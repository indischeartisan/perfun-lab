-- Public references must agree across the pre-existing customer, Admin, and
-- Vendor data paths. The fixture exercises RLS as each role and rolls back.
begin;

insert into auth.users(id, email) values
  ('d0100000-0000-4000-8000-000000000001', 'public-number-customer@example.invalid'),
  ('d0100000-0000-4000-8000-000000000002', 'public-number-other-customer@example.invalid'),
  ('d0100000-0000-4000-8000-000000000003', 'public-number-admin@example.invalid'),
  ('d0100000-0000-4000-8000-000000000004', 'public-number-vendor@example.invalid'),
  ('d0100000-0000-4000-8000-000000000005', 'public-number-other-vendor@example.invalid');

update public.profiles set role = 'admin' where id = 'd0100000-0000-4000-8000-000000000003';
update public.profiles set role = 'vendor' where id in ('d0100000-0000-4000-8000-000000000004', 'd0100000-0000-4000-8000-000000000005');

insert into public.orders(
  id, order_number, user_id, request_id, request_payload, address_snapshot,
  subtotal, discount, shipping, grand_total, payment_status, status
) values (
  'd0200000-0000-4000-8000-000000000001',
  'INTERNAL-PUBLIC-PROJECTION',
  'd0100000-0000-4000-8000-000000000001',
  'd0300000-0000-4000-8000-000000000001',
  '{}', '{}', 100000, 0, 0, 100000, 'paid', 'paid'
);

insert into public.order_items(
  id, order_id, position, product_snapshot, creations_snapshot, quantity,
  normal_unit_price, unit_price, line_total
) values (
  'd0400000-0000-4000-8000-000000000001',
  'd0200000-0000-4000-8000-000000000001',
  1,
  '{"id":"10ml","label":"10 ML","volume_ml":10,"bottle_count":1}',
  '[]', 1, 100000, 100000, 100000
);

create temp table public_number_fixture as
select public_order_number as reference
from public.orders
where id = 'd0200000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0100000-0000-4000-8000-000000000003', true);
select public.admin_assign_vendor('d0200000-0000-4000-8000-000000000001', 'd0100000-0000-4000-8000-000000000004');

do $$
declare
  customer_reference text;
  customer_visible_reference text;
  admin_reference text;
  vendor_reference text;
begin
  select reference into customer_reference from public_number_fixture;

  if customer_reference !~ '^PF-[0-9]{6,}$' then
    raise exception 'Customer order has no public number: %', customer_reference;
  end if;

  perform set_config('request.jwt.claim.sub', 'd0100000-0000-4000-8000-000000000001', true);
  select public_order_number into customer_visible_reference
  from public.orders
  where id = 'd0200000-0000-4000-8000-000000000001';
  if customer_visible_reference is distinct from customer_reference then
    raise exception 'Customer order response differs from its public reference';
  end if;

  perform set_config('request.jwt.claim.sub', 'd0100000-0000-4000-8000-000000000003', true);
  select element.value->>'public_order_number' into admin_reference
  from jsonb_array_elements(public.admin_orders(customer_reference, null, null, null, 0)->'rows') as element(value);
  if admin_reference is distinct from customer_reference then
    raise exception 'Admin public search did not return the customer reference';
  end if;

  if (public.admin_orders('INTERNAL-PUBLIC-PROJECTION', null, null, null, 0)->>'count')::integer <> 1 then
    raise exception 'Admin legacy internal-number search failed';
  end if;

  perform set_config('request.jwt.claim.sub', 'd0100000-0000-4000-8000-000000000004', true);
  select element.value->>'public_order_number' into vendor_reference
  from jsonb_array_elements(public.list_vendor_production_orders('queued')->'rows') as element(value);
  if vendor_reference is distinct from customer_reference then
    raise exception 'Vendor projection differs from customer public number';
  end if;

  if not exists (
    select 1 from public.production_jobs
    where order_item_id = 'd0400000-0000-4000-8000-000000000001'
      and public_order_number = customer_reference
  ) then
    raise exception 'Production projection omitted the public number';
  end if;

  perform set_config('request.jwt.claim.sub', 'd0100000-0000-4000-8000-000000000002', true);
  if exists (select 1 from public.orders where public_order_number = customer_reference) then
    raise exception 'Customer could guess another customer public number';
  end if;

  perform set_config('request.jwt.claim.sub', 'd0100000-0000-4000-8000-000000000005', true);
  if exists (
    select 1
    from jsonb_array_elements(public.list_vendor_production_orders('queued')->'rows') as element(value)
    where element.value->>'public_order_number' = customer_reference
  ) then
    raise exception 'Vendor could guess another vendor public number';
  end if;
end;
$$;

reset role;
rollback;
select 'PASS: customer, Admin, and Vendor share public references without bypassing RLS' as result;
