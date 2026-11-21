-- Inventory is opt-in so existing catalog rows and historical orders remain unchanged.
alter table public.products add column if not exists stock_on_hand bigint;
alter table public.products add column if not exists stock_reserved bigint not null default 0;
alter table public.products add column if not exists stock_sold bigint not null default 0;
alter table public.products add column if not exists stock_tracking_enabled boolean not null default false;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='products_stock_values_check') then
    alter table public.products add constraint products_stock_values_check check (
      stock_reserved >= 0 and stock_sold >= 0 and
      (stock_on_hand is null or (stock_on_hand >= 0 and stock_reserved + stock_sold <= stock_on_hand))
    );
  end if;
  if not exists (select 1 from pg_constraint where conname='products_stock_tracking_check') then
    alter table public.products add constraint products_stock_tracking_check check (
      not stock_tracking_enabled or stock_on_hand is not null
    );
  end if;
end $$;

create table public.order_inventory_reservations (
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id text not null references public.products(id),
  quantity bigint not null check (quantity > 0),
  status text not null default 'reserved' check (status in ('reserved','sold','released')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (order_id, product_id)
);
create index order_inventory_reservations_status_idx on public.order_inventory_reservations(status,product_id);
alter table public.order_inventory_reservations enable row level security;
revoke all on public.order_inventory_reservations from public,anon,authenticated;
create trigger order_inventory_reservations_touch_updated_at before update on public.order_inventory_reservations for each row execute function private.touch_updated_at();

-- All inventory mutations share one transaction lock. This keeps multi-item orders
-- deterministic without relying on the order in which line items arrive.
create or replace function private.reserve_inventory_for_order_item()
returns trigger language plpgsql security definer set search_path='' as $$
declare
 physical_id text; required_quantity bigint; inventory public.products;
begin
  physical_id:=case when new.product_snapshot->>'id'='bundle-3x10ml' then '10ml' else new.product_snapshot->>'id' end;
  required_quantity:=case when new.product_snapshot->>'id'='bundle-3x10ml' then new.quantity::bigint*3 else new.quantity::bigint end;
  if physical_id not in ('10ml','30ml') or required_quantity<=0 then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('perfun-product-inventory',0));
  select * into inventory from public.products where id=physical_id for update;
  if not found then return new; end if;
  if not inventory.stock_tracking_enabled then return new; end if;
  if inventory.stock_tracking_enabled then
    if inventory.stock_on_hand is null then raise exception 'Stock has not been initialized by Admin' using errcode='23514'; end if;
    if inventory.stock_on_hand-inventory.stock_reserved-inventory.stock_sold<required_quantity then
      raise exception 'Not enough stock for %',physical_id using errcode='P0001';
    end if;
  end if;
  update public.products set stock_reserved=stock_reserved+required_quantity where id=physical_id;
  insert into public.order_inventory_reservations(order_id,product_id,quantity,status)
  values(new.order_id,physical_id,required_quantity,'reserved')
  on conflict(order_id,product_id) do update set quantity=order_inventory_reservations.quantity+excluded.quantity,status='reserved',updated_at=clock_timestamp();
  return new;
end $$;
revoke all on function private.reserve_inventory_for_order_item() from public,anon,authenticated;
create trigger order_items_reserve_inventory after insert on public.order_items for each row execute function private.reserve_inventory_for_order_item();

create or replace function private.reacquire_inventory_for_order(p_order_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare reservation public.order_inventory_reservations; inventory public.products;
begin
  perform pg_advisory_xact_lock(hashtextextended('perfun-product-inventory',0));
  for reservation in select * from public.order_inventory_reservations where order_id=p_order_id and status='released' order by product_id for update loop
    select * into inventory from public.products where id=reservation.product_id for update;
    if not found then raise exception 'Inventory product unavailable' using errcode='P0002'; end if;
    if inventory.stock_on_hand is null then raise exception 'Stock has not been initialized by Admin' using errcode='23514'; end if;
    if inventory.stock_tracking_enabled and inventory.stock_on_hand-inventory.stock_reserved-inventory.stock_sold<reservation.quantity then
      raise exception 'Not enough stock for %',reservation.product_id using errcode='P0001';
    end if;
    update public.products set stock_reserved=stock_reserved+reservation.quantity where id=reservation.product_id;
    update public.order_inventory_reservations set status='reserved',updated_at=clock_timestamp() where order_id=reservation.order_id and product_id=reservation.product_id;
  end loop;
end $$;
revoke all on function private.reacquire_inventory_for_order(uuid) from public,anon,authenticated;

create or replace function private.settle_inventory_for_order(p_order_id uuid,p_status text)
returns void language plpgsql security definer set search_path='' as $$
declare reservation public.order_inventory_reservations; inventory public.products; available bigint;
begin
  if p_status not in ('paid','expired') then return; end if;
  perform pg_advisory_xact_lock(hashtextextended('perfun-product-inventory',0));
  for reservation in select * from public.order_inventory_reservations where order_id=p_order_id order by product_id for update loop
    select * into inventory from public.products where id=reservation.product_id for update;
    if not found then raise exception 'Inventory product unavailable' using errcode='P0002'; end if;
    if p_status='expired' and reservation.status='reserved' then
      update public.products set stock_reserved=stock_reserved-reservation.quantity where id=reservation.product_id;
      update public.order_inventory_reservations set status='released',updated_at=clock_timestamp() where order_id=reservation.order_id and product_id=reservation.product_id;
    elsif p_status='paid' and reservation.status='reserved' then
      update public.products set stock_reserved=stock_reserved-reservation.quantity,stock_sold=stock_sold+reservation.quantity where id=reservation.product_id;
      update public.order_inventory_reservations set status='sold',updated_at=clock_timestamp() where order_id=reservation.order_id and product_id=reservation.product_id;
    elsif p_status='paid' and reservation.status='released' then
      if inventory.stock_on_hand is null then raise exception 'Stock has not been initialized by Admin' using errcode='23514'; end if;
      available:=inventory.stock_on_hand-inventory.stock_reserved-inventory.stock_sold;
      if inventory.stock_tracking_enabled and available<reservation.quantity then raise exception 'Not enough stock for %',reservation.product_id using errcode='P0001'; end if;
      update public.products set stock_sold=stock_sold+reservation.quantity where id=reservation.product_id;
      update public.order_inventory_reservations set status='sold',updated_at=clock_timestamp() where order_id=reservation.order_id and product_id=reservation.product_id;
    end if;
  end loop;
end $$;
revoke all on function private.settle_inventory_for_order(uuid,text) from public,anon,authenticated;

create or replace function private.payment_inventory_insert()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform private.reacquire_inventory_for_order(new.order_id);
  return new;
end $$;
revoke all on function private.payment_inventory_insert() from public,anon,authenticated;
create trigger payments_reacquire_inventory after insert on public.payments for each row execute function private.payment_inventory_insert();

create or replace function private.payment_inventory_update()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status is distinct from old.status then
    if new.status='paid' then perform private.settle_inventory_for_order(new.order_id,'paid');
    elsif new.status='expired' then perform private.settle_inventory_for_order(new.order_id,'expired');
    end if;
  end if;
  return new;
end $$;
revoke all on function private.payment_inventory_update() from public,anon,authenticated;
create trigger payments_settle_inventory after update of status on public.payments for each row execute function private.payment_inventory_update();

create or replace function private.admin_catalog()
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform private.require_admin();
  return jsonb_build_object(
    'notes',(select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'name',n.name,'active',n.active,'category',n.category,'descriptor',n.short_description,'sticker_asset',n.sticker_asset,'version',n.version,'phases',(select coalesce(jsonb_agg(jsonb_build_object('phase',np.phase,'enabled',np.enabled,'sort_order',np.sort_order,'prediction_text',np.prediction_text) order by np.phase),'[]'::jsonb) from public.note_phases np where np.note_id=n.id)) order by n.name),'[]'::jsonb) from public.notes n),
    'products',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'label',p.label,'active',p.active,'version',p.version,'regular_price',(select amount from public.product_prices where product_id=p.id and kind='normal'),'sale_price',(select amount from public.product_prices where product_id=p.id and kind='launch'),'stock_on_hand',p.stock_on_hand,'stock_reserved',p.stock_reserved,'stock_sold',p.stock_sold,'stock_tracking_enabled',p.stock_tracking_enabled) order by p.sort_order),'[]'::jsonb) from public.products p)
  );
end $$;

create or replace function private.admin_save_product_with_inventory(p_id text,p_version bigint,p_active boolean,p_regular_price integer,p_sale_price integer,p_stock_on_hand bigint,p_stock_tracking_enabled boolean)
returns void language plpgsql security definer set search_path='' as $$
declare product public.products; physical boolean:=p_id in ('10ml','30ml');
begin
  perform private.require_admin();
  select * into product from public.products where id=p_id for update;
  if not found then raise exception 'Product not found' using errcode='P0002'; end if;
  if p_version is distinct from product.version then raise exception 'Product changed. Reload before saving.' using errcode='40001'; end if;
  if p_active is null or p_regular_price is null or p_regular_price<=0 or (p_sale_price is not null and (p_sale_price<=0 or p_sale_price>p_regular_price)) then raise exception 'Prices must be positive whole rupiah; sale cannot exceed regular price' using errcode='23514'; end if;
  if not physical and (p_stock_on_hand is not null or coalesce(p_stock_tracking_enabled,false)) then raise exception 'Play Set stock is calculated from 10 ML stock' using errcode='23514'; end if;
  if p_stock_on_hand is not null and p_stock_on_hand<0 then raise exception 'Stock cannot be negative' using errcode='23514'; end if;
  if physical and coalesce(p_stock_tracking_enabled,false) and p_stock_on_hand is null then raise exception 'Enter initial stock before enabling stock limits' using errcode='23514'; end if;
  if p_stock_on_hand is not null and p_stock_on_hand<product.stock_reserved+product.stock_sold then raise exception 'Stock cannot be lower than reserved or sold stock' using errcode='23514'; end if;
  update public.products set active=p_active,version=version+1,stock_on_hand=case when physical then p_stock_on_hand else null end,stock_tracking_enabled=case when physical then coalesce(p_stock_tracking_enabled,false) else false end where id=p_id;
  insert into public.product_prices(product_id,kind,amount) values(p_id,'normal',p_regular_price) on conflict(product_id,kind) do update set amount=excluded.amount;
  if p_sale_price is null then delete from public.product_prices where product_id=p_id and kind='launch'; else insert into public.product_prices(product_id,kind,amount) values(p_id,'launch',p_sale_price) on conflict(product_id,kind) do update set amount=excluded.amount; end if;
end $$;

create or replace function public.admin_save_product(p_id text,p_version bigint,p_active boolean,p_regular_price integer,p_sale_price integer,p_stock_on_hand bigint,p_stock_tracking_enabled boolean)
returns void language sql security invoker set search_path='' as $$ select private.admin_save_product_with_inventory(p_id,p_version,p_active,p_regular_price,p_sale_price,p_stock_on_hand,p_stock_tracking_enabled); $$;

do $$ begin
  revoke all on function public.admin_catalog() from public,anon,authenticated;
  grant execute on function public.admin_catalog() to authenticated;
  revoke all on function public.admin_save_product(text,bigint,boolean,integer,integer,bigint,boolean) from public,anon,authenticated;
  grant execute on function public.admin_save_product(text,bigint,boolean,integer,integer,bigint,boolean) to authenticated;
  revoke all on function private.admin_save_product_with_inventory(text,bigint,boolean,integer,integer,bigint,boolean) from public,anon,authenticated;
end $$;
