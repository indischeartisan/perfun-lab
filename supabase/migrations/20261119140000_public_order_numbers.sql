-- Public references are distinct from immutable internal order numbers and IDs.
create sequence private.public_order_number_seq as bigint start with 128;

alter table public.orders add column public_order_number text;

-- Give every pre-existing order one deterministic, permanent public number.
with legacy_orders as (
  select id, row_number() over (order by created_at, id) as sequence_value
  from public.orders
  where public_order_number is null
)
update public.orders o
set public_order_number = 'PF-' || lpad((127 + legacy_orders.sequence_value)::text, 6, '0')
from legacy_orders
where o.id = legacy_orders.id;

select setval(
  'private.public_order_number_seq',
  greatest(
    127,
    coalesce(
      (select max(substring(public_order_number from 4)::bigint) from public.orders),
      127
    )
  ),
  true
);

alter table public.orders
  alter column public_order_number set not null,
  add constraint orders_public_order_number_format_check
    check (public_order_number ~ '^PF-[0-9]{6,}$'),
  add constraint orders_public_order_number_key unique (public_order_number);

create function private.next_public_order_number()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  value bigint;
begin
  value := nextval('private.public_order_number_seq');
  return 'PF-' || lpad(value::text, 6, '0');
end;
$$;

create function private.assign_public_order_number()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.public_order_number is not null then
      raise exception 'Public order number is server assigned' using errcode = '42501';
    end if;

    new.public_order_number := private.next_public_order_number();
  elsif new.public_order_number is distinct from old.public_order_number then
    raise exception 'Public order number cannot be changed' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger orders_assign_public_order_number
before insert or update on public.orders
for each row
execute function private.assign_public_order_number();

do $$
begin
  if exists (select 1 from public.orders where public_order_number is null) then
    raise exception 'Every order must have a public order number';
  end if;
end;
$$;

