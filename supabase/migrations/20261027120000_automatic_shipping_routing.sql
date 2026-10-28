-- Phase 5B.2: automatic island routing. This migration does not enable shipping.
-- Routing is resolved in the Edge Function from verified RajaOngkir labels only.

do $$
declare constraint_name text; table_name text;
begin
  for constraint_name, table_name in
    select conname, r.relname
    from pg_constraint c
    join pg_class r on r.oid=c.conrelid
    join pg_namespace n on n.oid=r.relnamespace
    where c.contype='c' and n.nspname='private' and r.relname in ('shipping_quote_cache','shipping_quotes')
      and pg_get_constraintdef(c.oid) like '%courier_code%'
  loop
    execute format('alter table private.%I drop constraint %I', table_name, constraint_name);
  end loop;
end $$;

alter table private.shipping_quote_cache
  add constraint shipping_quote_cache_courier_code_check check(courier_code in ('jnt','anteraja'));

alter table private.shipping_quotes
  add constraint shipping_quotes_courier_code_check check(courier_code in ('jnt','anteraja')),
  add column if not exists routing_version text not null default 'indonesia-province-v1'
    check(routing_version='indonesia-province-v1'),
  add column if not exists origin_region text not null default 'unknown'
    check(origin_region in ('java','outside-java','unknown')),
  add column if not exists destination_region text not null default 'unknown'
    check(destination_region in ('java','outside-java','unknown'));

-- The existing destination fields remain provider-verified. Add the verified
-- origin label to the service-only context so the Edge Function can resolve both
-- ends of a route without using free-form address strings.
create or replace function private.shipping_quote_context(p_user_id uuid,p_address_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare feature private.shipping_feature_settings; origin private.shipping_origin_settings; profile private.shipping_package_profiles;
 address public.addresses; address_json jsonb;
begin
 select * into feature from private.shipping_feature_settings where singleton=true for share;
 if feature.enabled is distinct from true then raise exception 'Shipping integration is not enabled' using errcode='23514'; end if;
 select * into origin from private.shipping_origin_settings where singleton=true for share;
 if origin.status<>'active' or origin.origin_destination_id is null or origin.origin_destination_label='{}'::jsonb then raise exception 'Shipping origin is not verified and active' using errcode='23514'; end if;
 select * into profile from private.shipping_package_profiles where active for share;
 if not found then raise exception 'No active shipping package profile' using errcode='23514'; end if;
 select * into address from public.addresses where id=p_address_id and user_id=p_user_id for share;
 if not found then raise exception 'Choose your own saved address' using errcode='42501'; end if;
 if address.rajaongkir_destination_id is null or address.rajaongkir_destination_label='{}'::jsonb then raise exception 'Choose a verified shipping destination' using errcode='23514'; end if;
 address_json:=jsonb_build_object('recipient_name',address.recipient_name,'phone',address.phone,'address_line',address.address_line,'city',address.city,'province',address.province,'postal_code',address.postal_code,'district',address.district,'destination_id',address.rajaongkir_destination_id,'destination_label',address.rajaongkir_destination_label);
 return jsonb_build_object('origin_destination_id',origin.origin_destination_id,'origin_destination_label',origin.origin_destination_label,'origin_version',origin.version,'package_profile_version',profile.profile_version,'packaging_tare_grams',profile.packaging_tare_grams,'address',address_json);
end $$;

drop function if exists public.create_shipping_quote(uuid,uuid,jsonb,text,text,text,bigint,text);
drop function if exists private.create_shipping_quote(uuid,uuid,jsonb,text,text,text,bigint,text);

create function private.create_shipping_quote(
  p_user_id uuid,p_address_id uuid,p_items jsonb,p_courier_code text,p_courier_name text,p_service text,p_amount bigint,p_etd text,
  p_routing_version text,p_origin_region text,p_destination_region text
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare context jsonb; weight jsonb; address public.addresses; quote private.shipping_quotes;
begin
 context:=private.shipping_quote_context(p_user_id,p_address_id);
 weight:=private.shipping_weight_for_items(p_items);
 if p_courier_code not in ('jnt','anteraja') or length(btrim(coalesce(p_courier_name,''))) not between 1 and 100 or length(btrim(coalesce(p_service,''))) not between 1 and 100 or p_amount is null or p_amount<=0 or length(coalesce(p_etd,''))>100 then raise exception 'Invalid provider shipping quote' using errcode='23514'; end if;
 if p_routing_version<>'indonesia-province-v1' or p_origin_region not in ('java','outside-java') or p_destination_region not in ('java','outside-java')
    or (p_origin_region=p_destination_region and p_courier_code<>'jnt')
    or (p_origin_region<>p_destination_region and p_courier_code<>'anteraja') then raise exception 'Invalid automatic shipping route' using errcode='23514'; end if;
 select * into address from public.addresses where id=p_address_id and user_id=p_user_id for share;
 insert into private.shipping_quotes(user_id,address_id,address_fingerprint,items_fingerprint,origin_version,package_profile_version,origin_destination_id,destination_id,destination_label,weight_grams,courier_code,courier_name,service,amount,etd,routing_version,origin_region,destination_region,expires_at)
 values(p_user_id,p_address_id,private.shipping_digest(to_jsonb(address)),private.shipping_digest(p_items),
  (context->>'origin_version')::integer,(weight->>'package_profile_version')::integer,(context->>'origin_destination_id')::bigint,
  (context->'address'->>'destination_id')::bigint,context->'address'->'destination_label',(weight->>'weight_grams')::integer,
  p_courier_code,btrim(p_courier_name),btrim(p_service),p_amount,coalesce(p_etd,''),p_routing_version,p_origin_region,p_destination_region,clock_timestamp()+interval '10 minutes') returning * into quote;
 return jsonb_build_object('quote_id',quote.id,'courier_code',quote.courier_code,'courier_name',quote.courier_name,'service',quote.service,'amount',quote.amount,'etd',quote.etd,'weight_grams',quote.weight_grams,'origin_version',quote.origin_version,'package_profile_version',quote.package_profile_version,'expires_at',quote.expires_at);
end $$;
revoke all on function private.create_shipping_quote(uuid,uuid,jsonb,text,text,text,bigint,text,text,text,text) from public,anon,authenticated;

create function public.create_shipping_quote(
  p_user_id uuid,p_address_id uuid,p_items jsonb,p_courier_code text,p_courier_name text,p_service text,p_amount bigint,p_etd text,
  p_routing_version text,p_origin_region text,p_destination_region text
)
returns jsonb language sql security definer set search_path='' as $$
  select private.create_shipping_quote(p_user_id,p_address_id,p_items,p_courier_code,p_courier_name,p_service,p_amount,p_etd,p_routing_version,p_origin_region,p_destination_region)
$$;
revoke all on function public.create_shipping_quote(uuid,uuid,jsonb,text,text,text,bigint,text,text,text,text) from public,anon,authenticated;
grant execute on function public.create_shipping_quote(uuid,uuid,jsonb,text,text,text,bigint,text,text,text,text) to service_role;
