-- Preserve the existing addresses table; bootstrap it on fresh projects too.
create table if not exists public.addresses (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 recipient_name text not null, phone text not null, address_line text not null, city text not null, province text not null,
 postal_code text not null, label text not null, is_default boolean not null default false,
 district text not null default '', delivery_note text not null default '',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.addresses alter column district set default '';
create unique index if not exists addresses_one_default_per_user on public.addresses(user_id) where is_default;
create index if not exists addresses_user_idx on public.addresses(user_id);
alter table public.addresses enable row level security;
drop policy if exists addresses_select_own_or_admin on public.addresses;
drop policy if exists addresses_insert_own_or_admin on public.addresses;
drop policy if exists addresses_update_own_or_admin on public.addresses;
drop policy if exists addresses_delete_own_or_admin on public.addresses;
create policy addresses_select_own on public.addresses for select to authenticated using (user_id=(select auth.uid()));
create policy addresses_insert_own on public.addresses for insert to authenticated with check (user_id=(select auth.uid()));
create policy addresses_update_own on public.addresses for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy addresses_delete_own on public.addresses for delete to authenticated using (user_id=(select auth.uid()));
revoke all on public.addresses from anon, authenticated;
grant select,insert,update,delete on public.addresses to authenticated;
drop trigger if exists addresses_touch_updated_at on public.addresses;
create trigger addresses_touch_updated_at before update on public.addresses for each row execute function private.touch_updated_at();

create function public.save_address(p_id uuid, p_address jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare field text; make_default boolean;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 -- Serialize default switching for this owner, not globally.
 perform 1 from public.profiles where id=auth.uid() for update;
 foreach field in array array['recipient_name','phone','address_line','city','province','postal_code','label'] loop
  if length(btrim(coalesce(p_address->>field,''))) not between 1 and 500 then raise exception 'Invalid address field: %',field using errcode='23514'; end if;
 end loop;
 make_default := coalesce((p_address->>'is_default')::boolean,false) or not exists(select 1 from public.addresses where user_id=auth.uid());
 if make_default then update public.addresses set is_default=false where user_id=auth.uid() and is_default and id<>p_id; end if;
 insert into public.addresses(id,user_id,recipient_name,phone,address_line,city,province,postal_code,label,is_default)
 values(p_id,auth.uid(),btrim(p_address->>'recipient_name'),btrim(p_address->>'phone'),btrim(p_address->>'address_line'),btrim(p_address->>'city'),btrim(p_address->>'province'),btrim(p_address->>'postal_code'),btrim(p_address->>'label'),make_default)
 on conflict(id) do update set recipient_name=excluded.recipient_name,phone=excluded.phone,address_line=excluded.address_line,city=excluded.city,province=excluded.province,postal_code=excluded.postal_code,label=excluded.label,is_default=excluded.is_default;
 return p_id;
end $$;
revoke all on function public.save_address(uuid,jsonb) from public,anon;
grant execute on function public.save_address(uuid,jsonb) to authenticated;

create table public.orders (
 id uuid primary key default gen_random_uuid(), order_number text not null unique,
 user_id uuid not null references public.profiles(id), request_id uuid not null,
 request_payload jsonb not null, status text not null default 'pending_payment' check(status in ('pending_payment','paid','cancelled','processing','shipped','completed')),
 address_snapshot jsonb not null, subtotal bigint not null check(subtotal>=0), discount bigint not null check(discount>=0 and discount<=subtotal),
 shipping bigint not null default 0 check(shipping>=0), grand_total bigint not null check(grand_total=subtotal-discount+shipping),
 currency text not null default 'IDR' check(currency='IDR'), created_at timestamptz not null default now(),
 unique(user_id,request_id)
);
create index orders_user_created_idx on public.orders(user_id,created_at desc);
create table public.order_items (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id), position integer not null,
 product_snapshot jsonb not null, creations_snapshot jsonb not null check(jsonb_typeof(creations_snapshot)='array'),
 quantity integer not null check(quantity between 1 and 99), normal_unit_price bigint not null check(normal_unit_price>0),
 unit_price bigint not null check(unit_price>0 and unit_price<=normal_unit_price),
 line_total bigint not null check(line_total=unit_price*quantity), unique(order_id,position)
);
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
revoke all on public.orders,public.order_items from anon,authenticated;
grant select on public.orders,public.order_items to authenticated;
create policy orders_read_own on public.orders for select to authenticated using(user_id=(select auth.uid()));
create policy order_items_read_own on public.order_items for select to authenticated using(exists(select 1 from public.orders o where o.id=order_id and o.user_id=(select auth.uid())));

-- Privileged implementation stays unexposed. Only this validated transaction can write orders.
-- Caller cannot supply price/status/snapshots. Every private lookup explicitly checks ownership.
create function private.checkout(p_address_id uuid,p_items jsonb,p_request_id uuid,p_quote_token text,p_submit boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 owner_id uuid := auth.uid(); existing public.orders; order_id uuid; order_no text;
 address_data jsonb; line jsonb; product public.products; normal_price bigint; launch_price bigint; unit_price bigint;
 qty integer; creation_id uuid; creation_data jsonb; blend_data jsonb; lines jsonb := '[]';
 subtotal bigint := 0; discount bigint := 0; result jsonb; token text; payload jsonb;
begin
 if owner_id is null or not exists(select 1 from public.profiles where id=owner_id) then raise exception 'Sign in required' using errcode='42501'; end if;
 payload := jsonb_build_object('address_id',p_address_id,'items',p_items);
 if p_submit then
  if p_request_id is null then raise exception 'Request ID required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text||p_request_id::text,0));
  select * into existing from public.orders where user_id=owner_id and request_id=p_request_id;
  if found then
   if existing.request_payload<>payload then raise exception 'Request ID already used for another checkout'; end if;
   return jsonb_build_object('order_id',existing.id);
  end if;
 end if;
 select jsonb_build_object('recipient_name',recipient_name,'phone',phone,'address_line',address_line,'city',city,'province',province,'postal_code',postal_code,'label',label,'district',district,'delivery_note',delivery_note)
 into address_data from public.addresses where id=p_address_id and user_id=owner_id for share;
 if address_data is null then raise exception 'Choose your own saved address' using errcode='42501'; end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 50 then raise exception 'Select order items'; end if;
 for line in select value from jsonb_array_elements(p_items) loop
  if coalesce(line->>'quantity','') !~ '^[1-9][0-9]?$' then raise exception 'Quantity must be 1 to 99'; end if;
  qty := (line->>'quantity')::integer;
  select * into product from public.products where id=line->>'product_id' and active for share;
  if not found or product.id not in ('10ml','30ml','bundle-3x10ml') then raise exception 'Product unavailable'; end if;
  perform 1 from public.product_prices where product_id=product.id for share;
  select amount into normal_price from public.product_prices where product_id=product.id and kind='normal';
  select amount into launch_price from public.product_prices where product_id=product.id and kind='launch';
  unit_price := least(normal_price,coalesce(launch_price,normal_price));
  if normal_price is null then raise exception 'Price unavailable'; end if;
  if jsonb_typeof(line->'creation_ids') is distinct from 'array' or jsonb_array_length(line->'creation_ids')<>product.bottle_count then raise exception 'Choose % creations',product.bottle_count; end if;
  if (select count(distinct value) from jsonb_array_elements_text(line->'creation_ids'))<>product.bottle_count then raise exception 'Choose distinct creations for each bottle'; end if;
  blend_data := '[]';
  for creation_id in select value::uuid from jsonb_array_elements_text(line->'creation_ids') loop
   perform 1 from public.creations where id=creation_id and user_id=owner_id for share;
   if not found then raise exception 'Choose your own saved creation' using errcode='42501'; end if;
   perform 1 from public.creation_notes cn join public.notes n on n.id=cn.note_id where cn.creation_id=creation_id for share of cn,n;
   select jsonb_build_object('id',c.id,'name',c.name,'notes',(
    select jsonb_agg(jsonb_build_object('phase',cn.phase,'note',to_jsonb(n)) order by case cn.phase when 'top' then 1 when 'middle' then 2 else 3 end)
    from public.creation_notes cn join public.notes n on n.id=cn.note_id where cn.creation_id=c.id
   )) into creation_data from public.creations c where c.id=creation_id and c.user_id=owner_id;
   if jsonb_array_length(creation_data->'notes')<>3 or exists(select 1 from public.creation_notes cn join public.notes n on n.id=cn.note_id where cn.creation_id=creation_id and not n.active) then raise exception 'Creation contains unavailable notes'; end if;
   blend_data := blend_data || jsonb_build_array(creation_data);
  end loop;
  lines := lines || jsonb_build_array(jsonb_build_object('product_snapshot',to_jsonb(product),'creations_snapshot',blend_data,'quantity',qty,'normal_unit_price',normal_price,'unit_price',unit_price,'line_total',unit_price*qty));
  subtotal := subtotal + normal_price*qty;
  discount := discount + (normal_price-unit_price)*qty;
 end loop;
 result := jsonb_build_object('address_snapshot',address_data,'items',lines,'subtotal',subtotal,'discount',discount,'shipping',0,'grand_total',subtotal-discount,'currency','IDR');
 token := md5(result::text);
 if not p_submit then return result || jsonb_build_object('quote_token',token); end if;
 if p_quote_token is distinct from token then raise exception 'Checkout changed. Review the latest details and prices again.' using errcode='P0001'; end if;
 order_id := gen_random_uuid(); order_no := 'PF-'||upper(replace(order_id::text,'-',''));
 insert into public.orders(id,order_number,user_id,request_id,request_payload,address_snapshot,subtotal,discount,shipping,grand_total)
 values(order_id,order_no,owner_id,p_request_id,payload,address_data,subtotal,discount,0,subtotal-discount);
 insert into public.order_items(order_id,position,product_snapshot,creations_snapshot,quantity,normal_unit_price,unit_price,line_total)
 select order_id,ordinality::integer,value->'product_snapshot',value->'creations_snapshot',(value->>'quantity')::integer,(value->>'normal_unit_price')::bigint,(value->>'unit_price')::bigint,(value->>'line_total')::bigint from jsonb_array_elements(lines) with ordinality;
 return jsonb_build_object('order_id',order_id);
end $$;
revoke all on function private.checkout(uuid,jsonb,uuid,text,boolean) from public,anon,authenticated;
grant usage on schema private to authenticated;
grant execute on function private.checkout(uuid,jsonb,uuid,text,boolean) to authenticated;
create function public.quote_order(p_address_id uuid,p_items jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.checkout(p_address_id,p_items,null,null,false); $$;
create function public.place_order(p_address_id uuid,p_items jsonb,p_request_id uuid,p_quote_token text) returns jsonb language sql security invoker set search_path='' as $$ select private.checkout(p_address_id,p_items,p_request_id,p_quote_token,true); $$;
revoke all on function public.quote_order(uuid,jsonb),public.place_order(uuid,jsonb,uuid,text) from public,anon;
grant execute on function public.quote_order(uuid,jsonb),public.place_order(uuid,jsonb,uuid,text) to authenticated;
