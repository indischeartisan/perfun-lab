-- Carry the immutable server-generated public reference into the existing
-- vendor-safe production projection. No new table grants or RLS policies are
-- introduced: vendors can only read rows they could already read.
alter table public.production_jobs add column public_order_number text;

update public.production_jobs j
set public_order_number = o.public_order_number
from public.order_items i
join public.orders o on o.id = i.order_id
where i.id = j.order_item_id;

alter table public.production_jobs
  alter column public_order_number set not null;

create or replace function private.prepare_production_job()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  item public.order_items;
  parent public.orders;
begin
  if tg_op = 'UPDATE' then
    if row(
      new.id, new.order_item_id, new.order_number, new.public_order_number,
      new.ordered_at, new.product_snapshot, new.formulas_snapshot,
      new.quantity, new.created_at
    ) is distinct from row(
      old.id, old.order_item_id, old.order_number, old.public_order_number,
      old.ordered_at, old.product_snapshot, old.formulas_snapshot,
      old.quantity, old.created_at
    ) then
      raise exception 'Production snapshot is immutable' using errcode = '23514';
    end if;

    new.updated_at := clock_timestamp();
    return new;
  end if;

  select * into item from public.order_items where id = new.order_item_id;
  select * into parent from public.orders where id = item.order_id for update;
  if parent.id is null or parent.payment_status <> 'paid' then
    raise exception 'Only paid orders can enter production' using errcode = '23514';
  end if;

  new.status := 'queued';
  new.assigned_to := null;
  new.started_at := null;
  new.completed_at := null;
  new.order_number := parent.order_number;
  new.public_order_number := parent.public_order_number;
  new.ordered_at := parent.created_at;
  new.quantity := item.quantity;
  new.production_allowed := true;
  new.product_snapshot := jsonb_build_object(
    'label', item.product_snapshot->>'label',
    'volume_ml', item.product_snapshot->'volume_ml',
    'bottle_count', item.product_snapshot->'bottle_count'
  );
  -- Whitelist note names only. Never copy customer identity, prices, or
  -- arbitrary snapshot keys into the operational projection.
  select coalesce(jsonb_agg(jsonb_build_object(
    'top', (select n->'note'->>'name' from jsonb_array_elements(blend->'notes') n where n->>'phase' = 'top' limit 1),
    'middle', (select n->'note'->>'name' from jsonb_array_elements(blend->'notes') n where n->>'phase' = 'middle' limit 1),
    'base', (select n->'note'->>'name' from jsonb_array_elements(blend->'notes') n where n->>'phase' = 'base' limit 1)
  ) order by position), '[]'::jsonb)
  into new.formulas_snapshot
  from jsonb_array_elements(item.creations_snapshot) with ordinality as b(blend, position);

  return new;
end;
$$;

-- Preserve the existing admin guard, signature, pagination, and recipe
-- snapshots while adding the public reference and searching it alongside the
-- legacy internal reference.
create or replace function private.admin_orders(
  p_search text,
  p_payment text,
  p_production text,
  p_shipment text,
  p_page integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform private.require_admin();
  if p_page is null or p_page not between 0 and 100000 or length(coalesce(p_search, '')) > 100 then
    raise exception 'Invalid search/page' using errcode = '22023';
  end if;
  if p_payment is not null and p_payment not in ('pending', 'paid', 'failed', 'expired', 'refunded') then
    raise exception 'Invalid payment filter' using errcode = '22023';
  end if;
  if p_production is not null and p_production not in ('not_started', 'queued', 'in_production', 'completed') then
    raise exception 'Invalid production filter' using errcode = '22023';
  end if;
  if p_shipment is not null and p_shipment not in ('not_created', 'pending', 'ready_to_ship', 'shipped', 'delivered') then
    raise exception 'Invalid shipment filter' using errcode = '22023';
  end if;

  with rows as (
    select
      o.id,
      o.order_number,
      o.public_order_number,
      o.created_at,
      o.status,
      o.grand_total,
      o.payment_status,
      jsonb_build_object('name', p.full_name, 'email', p.email) customer,
      coalesce(s.status, 'not_created') shipment_status,
      x.products,
      x.item_count,
      j.total as job_count,
      j.queued,
      j.in_progress,
      j.completed,
      case
        when j.total = 0 then 'not_started'
        when j.completed = x.item_count and x.item_count > 0 then 'completed'
        when j.in_progress > 0 or j.completed > 0 then 'in_production'
        else 'queued'
      end production_status
    from public.orders o
    join public.profiles p on p.id = o.user_id
    left join public.shipments s on s.order_id = o.id
    cross join lateral (
      select
        count(*) item_count,
        coalesce(jsonb_agg(jsonb_build_object(
          'label', i.product_snapshot->>'label',
          'volume_ml', i.product_snapshot->'volume_ml',
          'bottle_count', i.product_snapshot->'bottle_count',
          'quantity', i.quantity,
          'blends', coalesce((
            select jsonb_agg(jsonb_build_object(
              'label', nullif(blend.value->>'name', ''),
              'notes', coalesce((
                select jsonb_agg(jsonb_build_object(
                  'phase', note.value->>'phase',
                  'id', note.value->'note'->>'id',
                  'name', note.value->'note'->>'name'
                ) order by case note.value->>'phase' when 'top' then 1 when 'middle' then 2 when 'base' then 3 else 4 end)
                from jsonb_array_elements(case when jsonb_typeof(blend.value->'notes') = 'array' then blend.value->'notes' else '[]'::jsonb end) note
              ), '[]'::jsonb)
            ) order by blend.ordinality)
            from jsonb_array_elements(case when jsonb_typeof(i.creations_snapshot) = 'array' then i.creations_snapshot else '[]'::jsonb end) with ordinality blend(value, ordinality)
          ), '[]'::jsonb)
        ) order by i.position), '[]'::jsonb) products
      from public.order_items i
      where i.order_id = o.id
    ) x
    cross join lateral (
      select
        count(*) total,
        count(*) filter (where j.status = 'queued') queued,
        count(*) filter (where j.status = 'in_production') in_progress,
        count(*) filter (where j.status = 'completed') completed
      from public.production_jobs j
      join public.order_items i on i.id = j.order_item_id
      where i.order_id = o.id
    ) j
    where (p_payment is null or o.payment_status = p_payment)
      and (
        coalesce(btrim(p_search), '') = ''
        or strpos(lower(concat_ws(' ', o.order_number, o.public_order_number, p.full_name, p.email)), lower(btrim(p_search))) > 0
      )
  ), filtered as (
    select * from rows
    where (p_production is null or production_status = p_production)
      and (p_shipment is null or shipment_status = p_shipment)
  ), page as (
    select * from filtered order by created_at desc, id limit 25 offset p_page * 25
  )
  select jsonb_build_object(
    'count', (select count(*) from filtered),
    'rows', coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc, id) from page), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

-- This function remains SECURITY INVOKER: the only new value comes from the
-- production-job row already filtered by its existing Vendor RLS policy.
create or replace function public.list_vendor_production_orders(
  p_status text,
  p_after_ordered_at timestamptz default null,
  p_after_order_number text default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  result jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'vendor'
  ) then
    raise exception 'Vendor access required' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('queued', 'in_production', 'completed') then
    raise exception 'Invalid production stage' using errcode = '22023';
  end if;
  if (p_after_ordered_at is null) <> (p_after_order_number is null) then
    raise exception 'Invalid order cursor' using errcode = '22023';
  end if;

  with eligible as materialized (
    select distinct j.ordered_at, j.order_number, j.public_order_number
    from public.production_jobs j
    where j.vendor_id = auth.uid()
      and j.status = p_status
      and (p_after_ordered_at is null or (j.ordered_at, j.order_number) > (p_after_ordered_at, p_after_order_number))
    order by j.ordered_at, j.order_number
    limit 26
  ), page as materialized (
    select ordered_at, order_number, public_order_number
    from eligible
    order by ordered_at, order_number
    limit 25
  ), expanded as (
    select
      p.ordered_at,
      p.order_number,
      p.public_order_number,
      (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', j.id,
          'order_item_id', j.order_item_id,
          'status', j.status,
          'assigned_to', j.assigned_to,
          'started_at', j.started_at,
          'completed_at', j.completed_at,
          'created_at', j.created_at,
          'updated_at', j.updated_at,
          'order_number', j.order_number,
          'ordered_at', j.ordered_at,
          'quantity', j.quantity,
          'production_allowed', j.production_allowed,
          'product_snapshot', j.product_snapshot,
          'formulas_snapshot', j.formulas_snapshot
        ) order by j.created_at, j.id), '[]'::jsonb)
        from public.production_jobs j
        where j.vendor_id = auth.uid() and j.order_number = p.order_number
      ) jobs
    from page p
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(to_jsonb(e) order by e.ordered_at, e.order_number) from expanded e), '[]'::jsonb),
    'has_more', (select count(*) > 25 from eligible),
    'next_cursor', (
      select jsonb_build_object('ordered_at', p.ordered_at, 'order_number', p.order_number)
      from page p
      order by p.ordered_at desc, p.order_number desc
      limit 1
    )
  ) into result;

  return result;
end;
$$;
