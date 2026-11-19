-- The target migration must backfill a pre-existing order exactly once without
-- changing either of its internal identifiers.
begin;

do $$
declare
  original_public_number text;
  original_internal_number text;
  original_id uuid;
begin
  select public_order_number, order_number, id
  into original_public_number, original_internal_number, original_id
  from public.orders
  where id = 'b0500000-0000-4000-8000-000000000001';

  if original_public_number !~ '^PF-[0-9]{6,}$' then
    raise exception 'Legacy order was not backfilled with a public number: %', original_public_number;
  end if;

  update public.orders
  set status = 'processing'
  where id = original_id;

  if (select public_order_number from public.orders where id = original_id)
       is distinct from original_public_number then
    raise exception 'Legacy public order number changed after updating the order';
  end if;

  if (select order_number from public.orders where id = original_id)
       is distinct from original_internal_number
     or (select id from public.orders where id = original_id) is distinct from original_id then
    raise exception 'Legacy internal order identifiers changed during backfill';
  end if;
end;
$$;

rollback;
select 'PASS: legacy orders are backfilled once without changing internal identifiers' as result;
