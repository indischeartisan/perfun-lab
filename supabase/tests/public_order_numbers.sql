-- Public order numbers are server generated, immutable, and independent of
-- the internal identifiers. The entire fixture rolls back after verification.
begin;

insert into auth.users(id, email) values
  ('po100000-0000-4000-8000-000000000001', 'public-order-numbers@example.invalid');

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
) values
  (
    'po200000-0000-4000-8000-000000000001',
    'INTERNAL-CONCURRENT-ONE',
    'po100000-0000-4000-8000-000000000001',
    'po300000-0000-4000-8000-000000000001',
    '{}', '{}', 100000, 0, 0, 100000, '2026-11-19 00:00:00+00'
  ),
  (
    'po200000-0000-4000-8000-000000000002',
    'INTERNAL-CONCURRENT-TWO',
    'po100000-0000-4000-8000-000000000001',
    'po300000-0000-4000-8000-000000000002',
    '{}', '{}', 100000, 0, 0, 100000, '2026-11-19 00:00:00+00'
  );

do $$
declare
  original_public_number text;
  original_internal_number text;
begin
  select public_order_number, order_number
  into original_public_number, original_internal_number
  from public.orders
  where id = 'po200000-0000-4000-8000-000000000001';

  if original_public_number !~ '^PF-[0-9]{6,}$' then
    raise exception 'Public order number has the wrong format: %', original_public_number;
  end if;

  if (select count(distinct public_order_number)
      from public.orders
      where id in (
        'po200000-0000-4000-8000-000000000001',
        'po200000-0000-4000-8000-000000000002'
      )) <> 2 then
    raise exception 'Orders created by one statement received duplicate public numbers';
  end if;

  update public.orders
  set status = 'processing'
  where id = 'po200000-0000-4000-8000-000000000001';

  if (select public_order_number from public.orders where id = 'po200000-0000-4000-8000-000000000001')
       is distinct from original_public_number then
    raise exception 'Public order number changed after an order update';
  end if;

  if (select order_number from public.orders where id = 'po200000-0000-4000-8000-000000000001')
       is distinct from original_internal_number then
    raise exception 'Internal order number changed after an order update';
  end if;

  begin
    update public.orders
    set public_order_number = 'PF-999999'
    where id = 'po200000-0000-4000-8000-000000000001';
    raise exception 'Public order number update was accepted';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.orders(
      id, public_order_number, order_number, user_id, request_id,
      request_payload, address_snapshot, subtotal, discount, shipping, grand_total
    ) values (
      'po200000-0000-4000-8000-000000000003',
      'PF-999999',
      'INTERNAL-CALLER-SUPPLIED',
      'po100000-0000-4000-8000-000000000001',
      'po300000-0000-4000-8000-000000000003',
      '{}', '{}', 100000, 0, 0, 100000
    );
    raise exception 'Caller-supplied public order number was accepted';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

rollback;
select 'PASS: public order numbers are server generated, unique, and immutable' as result;
