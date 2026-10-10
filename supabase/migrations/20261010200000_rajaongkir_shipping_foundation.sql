-- Phase 5B: fail-closed RajaOngkir Shipping Cost foundation. Checkout remains unchanged.
create extension if not exists pgcrypto with schema extensions;

create table private.shipping_origin_settings (
 singleton boolean primary key default true check(singleton),
 status text not null default 'inactive' check(status in ('inactive','active')),
 origin_destination_id bigint check(origin_destination_id > 0),
 origin_destination_label jsonb not null default '{}'::jsonb check(jsonb_typeof(origin_destination_label)='object'),
 address_snapshot jsonb not null check(jsonb_typeof(address_snapshot)='object'),
 version integer not null default 1 check(version > 0),
 verified_at timestamptz,
 verified_by uuid references public.profiles(id),
 updated_at timestamptz not null default clock_timestamp(),
 updated_by uuid references public.profiles(id),
 check((status='inactive' and origin_destination_id is null and verified_at is null and verified_by is null)
    or (status='active' and origin_destination_id is not null and verified_at is not null and verified_by is not null))
);
alter table private.shipping_origin_settings enable row level security;
revoke all on private.shipping_origin_settings from public,anon,authenticated;
grant all on private.shipping_origin_settings to service_role;

insert into private.shipping_origin_settings(singleton,address_snapshot)
values(true,jsonb_build_object('address_line','Jl. Kongsi No. 94, RT 05/RW 03','district','Tigaraksa','city','Kabupaten Tangerang','province','Banten','postal_code','15720','landmark','samping Kentang Arab 88'))
on conflict(singleton) do nothing;

create table private.shipping_feature_settings (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false,
 updated_at timestamptz not null default clock_timestamp(),
 updated_by uuid references public.profiles(id)
);
alter table private.shipping_feature_settings enable row level security;
revoke all on private.shipping_feature_settings from public,anon,authenticated;
grant all on private.shipping_feature_settings to service_role;
insert into private.shipping_feature_settings(singleton,enabled) values(true,false) on conflict(singleton) do nothing;

create table private.shipping_package_profiles (
 profile_version integer primary key check(profile_version > 0),
 product_weights jsonb not null check(jsonb_typeof(product_weights)='object'
  and product_weights ?& array['10ml','30ml','bundle-3x10ml']
  and jsonb_typeof(product_weights->'10ml')='number'
  and jsonb_typeof(product_weights->'30ml')='number'
  and jsonb_typeof(product_weights->'bundle-3x10ml')='number'),
 packaging_tare_grams integer not null check(packaging_tare_grams >= 0),
 active boolean not null default false,
 created_at timestamptz not null default clock_timestamp(),
 created_by uuid references public.profiles(id),
 retired_at timestamptz,
 check((product_weights->>'10ml')::integer > 0 and (product_weights->>'30ml')::integer > 0 and (product_weights->>'bundle-3x10ml')::integer > 0)
);
create unique index shipping_package_profiles_one_active_idx on private.shipping_package_profiles(active) where active;
alter table private.shipping_package_profiles enable row level security;
revoke all on private.shipping_package_profiles from public,anon,authenticated;
grant all on private.shipping_package_profiles to service_role;
insert into private.shipping_package_profiles(profile_version,product_weights,packaging_tare_grams,active)
values(1,'{"10ml":300,"30ml":500,"bundle-3x10ml":500}'::jsonb,200,true)
on conflict(profile_version) do nothing;

alter table public.addresses add column if not exists rajaongkir_destination_id bigint check(rajaongkir_destination_id > 0);
alter table public.addresses add column if not exists rajaongkir_destination_label jsonb not null default '{}'::jsonb check(jsonb_typeof(rajaongkir_destination_label)='object');
alter table public.addresses add column if not exists rajaongkir_destination_verified_at timestamptz;
create index addresses_rajaongkir_destination_idx on public.addresses(rajaongkir_destination_id) where rajaongkir_destination_id is not null;
-- Existing table-level update privilege would let a browser forge an ID. Preserve CRUD via save_address/delete,
-- while only the server-side binding function can alter provider destination fields.
revoke insert,update on public.addresses from authenticated;
grant insert(id,user_id,recipient_name,phone,address_line,city,province,postal_code,label,is_default,district,delivery_note) on public.addresses to authenticated;
grant update(recipient_name,phone,address_line,city,province,postal_code,label,is_default,district,delivery_note) on public.addresses to authenticated;

create table private.shipping_destination_cache (
 cache_key text primary key check(length(cache_key) between 16 and 128),
 query_normalized text not null check(length(query_normalized) between 2 and 160),
 results jsonb not null check(jsonb_typeof(results)='array'),
 expires_at timestamptz not null,
 created_at timestamptz not null default clock_timestamp(),
 check(expires_at > created_at)
);
alter table private.shipping_destination_cache enable row level security;
revoke all on private.shipping_destination_cache from public,anon,authenticated;
grant all on private.shipping_destination_cache to service_role;

create table private.shipping_quote_cache (
 cache_key text primary key check(length(cache_key) between 16 and 128),
 origin_version integer not null check(origin_version > 0),
 package_profile_version integer not null references private.shipping_package_profiles(profile_version),
 origin_destination_id bigint not null check(origin_destination_id > 0),
 destination_id bigint not null check(destination_id > 0),
 weight_grams integer not null check(weight_grams > 0),
 courier_code text not null check(courier_code in ('jne','jnt','sicepat')),
 rates jsonb not null check(jsonb_typeof(rates)='array'),
 expires_at timestamptz not null,
 created_at timestamptz not null default clock_timestamp(),
 check(expires_at > created_at)
);
alter table private.shipping_quote_cache enable row level security;
revoke all on private.shipping_quote_cache from public,anon,authenticated;
grant all on private.shipping_quote_cache to service_role;

create table private.shipping_quotes (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id),
 address_id uuid not null references public.addresses(id),
 address_fingerprint text not null check(length(address_fingerprint)=64),
 items_fingerprint text not null check(length(items_fingerprint)=64),
 origin_version integer not null,
 package_profile_version integer not null references private.shipping_package_profiles(profile_version),
 origin_destination_id bigint not null check(origin_destination_id > 0),
 destination_id bigint not null check(destination_id > 0),
 destination_label jsonb not null check(jsonb_typeof(destination_label)='object'),
 weight_grams integer not null check(weight_grams > 0),
 courier_code text not null check(courier_code in ('jne','jnt','sicepat')),
 courier_name text not null check(length(btrim(courier_name)) between 1 and 100),
 service text not null check(length(btrim(service)) between 1 and 100),
 amount bigint not null check(amount > 0),
 etd text not null default '' check(length(etd)<=100),
 expires_at timestamptz not null,
 created_at timestamptz not null default clock_timestamp(),
 check(expires_at > created_at and expires_at <= created_at + interval '10 minutes')
);
create index shipping_quotes_owner_expiry_idx on private.shipping_quotes(user_id,expires_at desc);
alter table private.shipping_quotes enable row level security;
revoke all on private.shipping_quotes from public,anon,authenticated;
grant all on private.shipping_quotes to service_role;

create table private.shipping_rate_limits (
 user_id uuid not null references public.profiles(id),
 action text not null check(action in ('destination','quote')),
 window_started_at timestamptz not null,
 request_count integer not null default 0 check(request_count >= 0),
 primary key(user_id,action,window_started_at)
);
alter table private.shipping_rate_limits enable row level security;
revoke all on private.shipping_rate_limits from public,anon,authenticated;
grant all on private.shipping_rate_limits to service_role;

create or replace function private.shipping_digest(p_value jsonb)
returns text language sql immutable set search_path='' as $$ select encode(extensions.digest(p_value::text,'sha256'),'hex'); $$;
revoke all on function private.shipping_digest(jsonb) from public,anon,authenticated;

create or replace function private.shipping_quote_context(p_user_id uuid,p_address_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare feature private.shipping_feature_settings; origin private.shipping_origin_settings; profile private.shipping_package_profiles;
 address public.addresses; address_json jsonb;
begin
 select * into feature from private.shipping_feature_settings where singleton=true for share;
 if feature.enabled is distinct from true then raise exception 'Shipping integration is not enabled' using errcode='23514'; end if;
 select * into origin from private.shipping_origin_settings where singleton=true for share;
 if origin.status<>'active' or origin.origin_destination_id is null then raise exception 'Shipping origin is not verified and active' using errcode='23514'; end if;
 select * into profile from private.shipping_package_profiles where active for share;
 if not found then raise exception 'No active shipping package profile' using errcode='23514'; end if;
 select * into address from public.addresses where id=p_address_id and user_id=p_user_id for share;
 if not found then raise exception 'Choose your own saved address' using errcode='42501'; end if;
 if address.rajaongkir_destination_id is null or address.rajaongkir_destination_label='{}'::jsonb then raise exception 'Choose a verified shipping destination' using errcode='23514'; end if;
 -- This context is deliberately for a future checkout intent. Product IDs and quantities are supplied as a validated server payload below.
 address_json:=jsonb_build_object('recipient_name',address.recipient_name,'phone',address.phone,'address_line',address.address_line,'city',address.city,'province',address.province,'postal_code',address.postal_code,'district',address.district,'destination_id',address.rajaongkir_destination_id,'destination_label',address.rajaongkir_destination_label);
 return jsonb_build_object('origin_destination_id',origin.origin_destination_id,'origin_version',origin.version,'package_profile_version',profile.profile_version,'packaging_tare_grams',profile.packaging_tare_grams,'address',address_json);
end $$;
revoke all on function private.shipping_quote_context(uuid,uuid) from public,anon,authenticated;
grant execute on function private.shipping_quote_context(uuid,uuid) to service_role;

create or replace function private.shipping_weight_for_items(p_items jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare profile private.shipping_package_profiles; line jsonb; product_id text; qty integer; unit_weight integer; total integer; normalized jsonb:='[]'::jsonb;
begin
 select * into profile from private.shipping_package_profiles where active for share;
 if not found then raise exception 'No active shipping package profile' using errcode='23514'; end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 50 then raise exception 'Select order items' using errcode='23514'; end if;
 total:=profile.packaging_tare_grams;
 for line in select value from jsonb_array_elements(p_items) loop
  product_id:=line->>'product_id';
  if product_id not in ('10ml','30ml','bundle-3x10ml') or coalesce(line->>'quantity','') !~ '^[1-9][0-9]?$' then raise exception 'Unsupported product or quantity for shipping' using errcode='23514'; end if;
  qty:=(line->>'quantity')::integer; unit_weight:=(profile.product_weights->>product_id)::integer;
  total:=total+(unit_weight*qty);
  normalized:=normalized||jsonb_build_array(jsonb_build_object('product_id',product_id,'quantity',qty,'unit_weight_grams',unit_weight));
 end loop;
 return jsonb_build_object('weight_grams',total,'package_profile_version',profile.profile_version,'items',normalized);
end $$;
revoke all on function private.shipping_weight_for_items(jsonb) from public,anon,authenticated;
grant execute on function private.shipping_weight_for_items(jsonb) to service_role;

create or replace function private.bind_address_shipping_destination(p_user_id uuid,p_address_id uuid,p_destination_id bigint,p_label jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_destination_id is null or p_destination_id<=0 or jsonb_typeof(p_label) is distinct from 'object' or p_label='{}'::jsonb or octet_length(p_label::text)>4000 then raise exception 'Invalid shipping destination' using errcode='23514'; end if;
 update public.addresses set rajaongkir_destination_id=p_destination_id,rajaongkir_destination_label=p_label,rajaongkir_destination_verified_at=clock_timestamp()
 where id=p_address_id and user_id=p_user_id;
 if not found then raise exception 'Choose your own saved address' using errcode='42501'; end if;
end $$;
revoke all on function private.bind_address_shipping_destination(uuid,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function private.bind_address_shipping_destination(uuid,uuid,bigint,jsonb) to service_role;

create or replace function private.consume_shipping_rate_limit(p_user_id uuid,p_action text)
returns void language plpgsql security definer set search_path='' as $$
declare bucket timestamptz:=date_trunc('minute',clock_timestamp()); maximum integer:=case p_action when 'destination' then 20 when 'quote' then 5 else null end; current_count integer;
begin
 if maximum is null then raise exception 'Invalid shipping rate-limit action' using errcode='22023'; end if;
 insert into private.shipping_rate_limits(user_id,action,window_started_at,request_count) values(p_user_id,p_action,bucket,1)
 on conflict(user_id,action,window_started_at) do update set request_count=private.shipping_rate_limits.request_count+1
 returning request_count into current_count;
 if current_count>maximum then raise exception 'Shipping request rate limit exceeded' using errcode='P0001'; end if;
end $$;
revoke all on function private.consume_shipping_rate_limit(uuid,text) from public,anon,authenticated;
grant execute on function private.consume_shipping_rate_limit(uuid,text) to service_role;

create or replace function private.admin_activate_shipping_origin(p_destination_id bigint,p_label jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare current private.shipping_origin_settings;
begin
 perform private.require_admin();
 if p_destination_id is null or p_destination_id<=0 or jsonb_typeof(p_label) is distinct from 'object' or p_label='{}'::jsonb or octet_length(p_label::text)>4000 then raise exception 'Verified RajaOngkir destination is required' using errcode='23514'; end if;
 select * into current from private.shipping_origin_settings where singleton=true for update;
 update private.shipping_origin_settings set status='active',origin_destination_id=p_destination_id,origin_destination_label=p_label,
  version=current.version+1,verified_at=clock_timestamp(),verified_by=auth.uid(),updated_at=clock_timestamp(),updated_by=auth.uid() where singleton=true;
end $$;
revoke all on function private.admin_activate_shipping_origin(bigint,jsonb) from public,anon,authenticated;
create or replace function public.admin_activate_shipping_origin(p_destination_id bigint,p_label jsonb)
returns void language sql security definer set search_path='' as $$ select private.admin_activate_shipping_origin(p_destination_id,p_label); $$;
revoke all on function public.admin_activate_shipping_origin(bigint,jsonb) from public,anon;
grant execute on function public.admin_activate_shipping_origin(bigint,jsonb) to authenticated;

create or replace function private.admin_set_shipping_feature_enabled(p_enabled boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_admin();
 if p_enabled and not exists(select 1 from private.shipping_origin_settings where singleton=true and status='active' and origin_destination_id is not null) then raise exception 'Activate a verified shipping origin before enabling shipping' using errcode='23514'; end if;
 update private.shipping_feature_settings set enabled=p_enabled,updated_at=clock_timestamp(),updated_by=auth.uid() where singleton=true;
end $$;
revoke all on function private.admin_set_shipping_feature_enabled(boolean) from public,anon,authenticated;
create or replace function public.admin_set_shipping_feature_enabled(p_enabled boolean)
returns void language sql security definer set search_path='' as $$ select private.admin_set_shipping_feature_enabled(p_enabled); $$;
revoke all on function public.admin_set_shipping_feature_enabled(boolean) from public,anon;
grant execute on function public.admin_set_shipping_feature_enabled(boolean) to authenticated;

create or replace function private.shipping_quote_cache_get(p_cache_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cached private.shipping_quote_cache;
begin
 select * into cached from private.shipping_quote_cache where cache_key=p_cache_key and expires_at>clock_timestamp();
 if not found then return null; end if;
 return jsonb_build_object('rates',cached.rates,'expires_at',cached.expires_at);
end $$;
revoke all on function private.shipping_quote_cache_get(text) from public,anon,authenticated;

create or replace function private.shipping_destination_cache_get(p_cache_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cached private.shipping_destination_cache;
begin
 select * into cached from private.shipping_destination_cache where cache_key=p_cache_key and expires_at>clock_timestamp();
 if not found then return null; end if;
 return cached.results;
end $$;
revoke all on function private.shipping_destination_cache_get(text) from public,anon,authenticated;

create or replace function private.shipping_destination_cache_put(p_cache_key text,p_query text,p_results jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
 if jsonb_typeof(p_results) is distinct from 'array' then raise exception 'Invalid shipping destination response' using errcode='23514'; end if;
 insert into private.shipping_destination_cache(cache_key,query_normalized,results,expires_at) values(p_cache_key,p_query,p_results,clock_timestamp()+interval '1 hour')
 on conflict(cache_key) do update set results=excluded.results,expires_at=excluded.expires_at,created_at=clock_timestamp();
end $$;
revoke all on function private.shipping_destination_cache_put(text,text,jsonb) from public,anon,authenticated;

create or replace function private.shipping_quote_cache_put(p_cache_key text,p_origin_version integer,p_package_profile_version integer,p_origin_destination_id bigint,p_destination_id bigint,p_weight_grams integer,p_courier_code text,p_rates jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
 if jsonb_typeof(p_rates) is distinct from 'array' or jsonb_array_length(p_rates)=0 then raise exception 'Shipping provider returned no rates' using errcode='23514'; end if;
 insert into private.shipping_quote_cache(cache_key,origin_version,package_profile_version,origin_destination_id,destination_id,weight_grams,courier_code,rates,expires_at)
 values(p_cache_key,p_origin_version,p_package_profile_version,p_origin_destination_id,p_destination_id,p_weight_grams,p_courier_code,p_rates,clock_timestamp()+interval '5 minutes')
 on conflict(cache_key) do update set rates=excluded.rates,expires_at=excluded.expires_at,created_at=clock_timestamp();
end $$;
revoke all on function private.shipping_quote_cache_put(text,integer,bigint,bigint,integer,text,jsonb) from public,anon,authenticated;

create or replace function private.create_shipping_quote(p_user_id uuid,p_address_id uuid,p_items jsonb,p_courier_code text,p_courier_name text,p_service text,p_amount bigint,p_etd text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare context jsonb; weight jsonb; address public.addresses; quote private.shipping_quotes;
begin
 context:=private.shipping_quote_context(p_user_id,p_address_id);
 weight:=private.shipping_weight_for_items(p_items);
 if p_courier_code not in ('jne','jnt','sicepat') or length(btrim(coalesce(p_courier_name,''))) not between 1 and 100 or length(btrim(coalesce(p_service,''))) not between 1 and 100 or p_amount is null or p_amount<=0 or length(coalesce(p_etd,''))>100 then raise exception 'Invalid provider shipping quote' using errcode='23514'; end if;
 select * into address from public.addresses where id=p_address_id and user_id=p_user_id for share;
 insert into private.shipping_quotes(user_id,address_id,address_fingerprint,items_fingerprint,origin_version,package_profile_version,origin_destination_id,destination_id,destination_label,weight_grams,courier_code,courier_name,service,amount,etd,expires_at)
 values(p_user_id,p_address_id,private.shipping_digest(to_jsonb(address)),private.shipping_digest(p_items),
  (context->>'origin_version')::integer,(weight->>'package_profile_version')::integer,(context->>'origin_destination_id')::bigint,
  (context->'address'->>'destination_id')::bigint,context->'address'->'destination_label',(weight->>'weight_grams')::integer,
  p_courier_code,btrim(p_courier_name),btrim(p_service),p_amount,coalesce(p_etd,''),clock_timestamp()+interval '10 minutes') returning * into quote;
 return jsonb_build_object('quote_id',quote.id,'courier_code',quote.courier_code,'courier_name',quote.courier_name,'service',quote.service,'amount',quote.amount,'etd',quote.etd,'weight_grams',quote.weight_grams,'origin_version',quote.origin_version,'package_profile_version',quote.package_profile_version,'expires_at',quote.expires_at);
end $$;
revoke all on function private.create_shipping_quote(uuid,uuid,jsonb,text,text,text,bigint,text) from public,anon,authenticated;

create or replace function private.read_shipping_quote(p_quote_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare quote private.shipping_quotes;
begin
 select * into quote from private.shipping_quotes where id=p_quote_id and user_id=auth.uid() and expires_at>clock_timestamp();
 if not found then raise exception 'Shipping quote not found' using errcode='42501'; end if;
 return jsonb_build_object('quote_id',quote.id,'courier_code',quote.courier_code,'courier_name',quote.courier_name,'service',quote.service,'amount',quote.amount,'etd',quote.etd,'weight_grams',quote.weight_grams,'expires_at',quote.expires_at);
end $$;
revoke all on function private.read_shipping_quote(uuid) from public,anon,authenticated;

-- Edge Functions call public service-only wrappers because the private schema is intentionally not exposed via Data API.
create or replace function public.shipping_quote_context(p_user_id uuid,p_address_id uuid) returns jsonb language sql security definer set search_path='' as $$ select private.shipping_quote_context(p_user_id,p_address_id); $$;
create or replace function public.shipping_weight_for_items(p_items jsonb) returns jsonb language sql security definer set search_path='' as $$ select private.shipping_weight_for_items(p_items); $$;
create or replace function public.consume_shipping_rate_limit(p_user_id uuid,p_action text) returns void language sql security definer set search_path='' as $$ select private.consume_shipping_rate_limit(p_user_id,p_action); $$;
create or replace function public.shipping_quote_cache_get(p_cache_key text) returns jsonb language sql security definer set search_path='' as $$ select private.shipping_quote_cache_get(p_cache_key); $$;
create or replace function public.shipping_destination_cache_get(p_cache_key text) returns jsonb language sql security definer set search_path='' as $$ select private.shipping_destination_cache_get(p_cache_key); $$;
create or replace function public.shipping_destination_cache_put(p_cache_key text,p_query text,p_results jsonb) returns void language sql security definer set search_path='' as $$ select private.shipping_destination_cache_put(p_cache_key,p_query,p_results); $$;
create or replace function public.shipping_quote_cache_put(p_cache_key text,p_origin_version integer,p_package_profile_version integer,p_origin_destination_id bigint,p_destination_id bigint,p_weight_grams integer,p_courier_code text,p_rates jsonb) returns void language sql security definer set search_path='' as $$ select private.shipping_quote_cache_put(p_cache_key,p_origin_version,p_package_profile_version,p_origin_destination_id,p_destination_id,p_weight_grams,p_courier_code,p_rates); $$;
create or replace function public.create_shipping_quote(p_user_id uuid,p_address_id uuid,p_items jsonb,p_courier_code text,p_courier_name text,p_service text,p_amount bigint,p_etd text) returns jsonb language sql security definer set search_path='' as $$ select private.create_shipping_quote(p_user_id,p_address_id,p_items,p_courier_code,p_courier_name,p_service,p_amount,p_etd); $$;
create or replace function public.bind_address_shipping_destination(p_user_id uuid,p_address_id uuid,p_destination_id bigint,p_label jsonb) returns void language sql security definer set search_path='' as $$ select private.bind_address_shipping_destination(p_user_id,p_address_id,p_destination_id,p_label); $$;
create or replace function public.get_shipping_quote(p_quote_id uuid) returns jsonb language sql security definer set search_path='' as $$ select private.read_shipping_quote(p_quote_id); $$;
revoke all on function public.shipping_quote_context(uuid,uuid),public.shipping_weight_for_items(jsonb),public.consume_shipping_rate_limit(uuid,text),public.shipping_quote_cache_get(text),public.shipping_destination_cache_get(text),public.shipping_destination_cache_put(text,text,jsonb),public.shipping_quote_cache_put(text,integer,integer,bigint,bigint,integer,text,jsonb),public.create_shipping_quote(uuid,uuid,jsonb,text,text,text,bigint,text),public.bind_address_shipping_destination(uuid,uuid,bigint,jsonb),public.get_shipping_quote(uuid) from public,anon,authenticated;
grant execute on function public.shipping_quote_context(uuid,uuid),public.shipping_weight_for_items(jsonb),public.consume_shipping_rate_limit(uuid,text),public.shipping_quote_cache_get(text),public.shipping_destination_cache_get(text),public.shipping_destination_cache_put(text,text,jsonb),public.shipping_quote_cache_put(text,integer,integer,bigint,bigint,integer,text,jsonb),public.create_shipping_quote(uuid,uuid,jsonb,text,text,text,bigint,text),public.bind_address_shipping_destination(uuid,uuid,bigint,jsonb) to service_role;
grant execute on function public.get_shipping_quote(uuid) to authenticated;
