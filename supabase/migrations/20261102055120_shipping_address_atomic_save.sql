-- Never leave a provider-verified destination attached to a manually edited region.
create function private.clear_stale_address_destination() returns trigger
language plpgsql set search_path='' as $$
begin
 if (new.city,new.province,new.postal_code,new.district) is distinct from (old.city,old.province,old.postal_code,old.district)
    and new.rajaongkir_destination_id is not distinct from old.rajaongkir_destination_id
    and new.rajaongkir_destination_label is not distinct from old.rajaongkir_destination_label
    and new.rajaongkir_destination_verified_at is not distinct from old.rajaongkir_destination_verified_at then
  new.rajaongkir_destination_id:=null;
  new.rajaongkir_destination_label:='{}'::jsonb;
  new.rajaongkir_destination_verified_at:=null;
 end if;
 return new;
end $$;
revoke all on function private.clear_stale_address_destination() from public,anon,authenticated;
create trigger addresses_clear_stale_destination before update on public.addresses
for each row execute function private.clear_stale_address_destination();

-- Existing checkout and fulfillment snapshots include district, but not a
-- separate subdistrict. Keep both verified names without duplication.
create function private.shipping_destination_district(p_label jsonb) returns text
language plpgsql immutable set search_path='' as $$
declare v_district text:=btrim(coalesce(p_label->>'district','')); v_subdistrict text:=btrim(coalesce(p_label->>'subdistrict',''));
begin
 if length(v_district)>160 or length(v_subdistrict)>160 then
  raise exception 'Shipping destination region is too long' using errcode='23514';
 end if;
 if v_district='' then return v_subdistrict; end if;
 if v_subdistrict='' or lower(v_district)=lower(v_subdistrict) then return v_district; end if;
 return v_subdistrict||', '||v_district;
end $$;
revoke all on function private.shipping_destination_district(jsonb) from public,anon,authenticated;

-- Legacy app versions bind after saving. Synchronize all provider-owned region
-- fields within the same transaction, or leave the previous address unchanged.
create or replace function private.bind_address_shipping_destination(p_user_id uuid,p_address_id uuid,p_destination_id bigint,p_label jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare v_city text; v_province text; v_postal_code text; v_district text;
begin
 perform 1 from public.addresses where id=p_address_id and user_id=p_user_id for update;
 if not found then raise exception 'Choose your own saved address' using errcode='42501'; end if;
 if p_destination_id is null or p_destination_id<=0 or jsonb_typeof(p_label) is distinct from 'object' or p_label='{}'::jsonb or octet_length(p_label::text)>4000 then
  raise exception 'Invalid shipping destination' using errcode='23514';
 end if;
 v_city:=btrim(coalesce(p_label->>'city','')); v_province:=btrim(coalesce(p_label->>'province',''));
 v_postal_code:=btrim(coalesce(p_label->>'postal_code','')); v_district:=private.shipping_destination_district(p_label);
 if length(v_city) not between 1 and 160 or length(v_province) not between 1 and 160 or length(v_postal_code) not between 1 and 24 then
  raise exception 'Shipping destination lacks complete region details; search again' using errcode='23514';
 end if;
 update public.addresses set city=v_city,province=v_province,postal_code=v_postal_code,district=v_district,
  rajaongkir_destination_id=p_destination_id,rajaongkir_destination_label=p_label,rajaongkir_destination_verified_at=clock_timestamp()
 where id=p_address_id and user_id=p_user_id;
 if not found then raise exception 'Choose your own saved address' using errcode='42501'; end if;
end $$;

-- Only the Edge Function may supply p_user_id; the provider label is loaded
-- from its short-lived cache, never from a browser-supplied JSON label.
create function private.save_verified_shipping_address(p_user_id uuid,p_id uuid,p_address jsonb,p_cache_key text,p_destination_id bigint)
returns uuid language plpgsql security definer set search_path='' as $$
declare field text; selected jsonb; candidate jsonb; matched integer:=0; make_default boolean;
 city text; province text; postal_code text; district text;
begin
 if p_user_id is null or p_id is null or not exists(select 1 from public.profiles where id=p_user_id and role='customer') then
  raise exception 'Customer account required' using errcode='42501';
 end if;
 if p_destination_id is null or p_destination_id<=0 or p_cache_key is null or jsonb_typeof(p_address) is distinct from 'object' then
  raise exception 'Invalid address or shipping destination' using errcode='23514';
 end if;
 for candidate in
  select x.value from private.shipping_destination_cache c cross join lateral jsonb_array_elements(c.results) x(value)
  where c.cache_key=p_cache_key and c.expires_at>clock_timestamp() and x.value->>'id'=p_destination_id::text
 loop
  matched:=matched+1; selected:=candidate->'label';
 end loop;
 if matched<>1 or jsonb_typeof(selected) is distinct from 'object' or selected='{}'::jsonb or octet_length(selected::text)>4000 then
  raise exception 'Shipping destination expired or invalid; search again' using errcode='23514';
 end if;
 city:=btrim(coalesce(selected->>'city','')); province:=btrim(coalesce(selected->>'province',''));
 postal_code:=btrim(coalesce(selected->>'postal_code','')); district:=private.shipping_destination_district(selected);
 if length(city) not between 1 and 160 or length(province) not between 1 and 160 or length(postal_code) not between 1 and 24 then
  raise exception 'Shipping destination lacks complete region details; search again' using errcode='23514';
 end if;
 foreach field in array array['recipient_name','phone','address_line','label'] loop
  if jsonb_typeof(p_address->field) is distinct from 'string' or length(btrim(coalesce(p_address->>field,''))) not between 1 and 500 then
   raise exception 'Invalid address field: %',field using errcode='23514';
  end if;
 end loop;
 if p_address ? 'is_default' and jsonb_typeof(p_address->'is_default') is distinct from 'boolean' then
  raise exception 'Invalid default address' using errcode='23514';
 end if;
 -- Serialize default-address changes and guard against a foreign address ID.
 perform 1 from public.profiles where id=p_user_id for update;
 if exists(select 1 from public.addresses where id=p_id and user_id<>p_user_id) then
  raise exception 'Choose your own saved address' using errcode='42501';
 end if;
 make_default:=coalesce((p_address->>'is_default')::boolean,false) or not exists(select 1 from public.addresses where user_id=p_user_id);
 if make_default then update public.addresses set is_default=false where user_id=p_user_id and is_default and id<>p_id; end if;
 insert into public.addresses(id,user_id,recipient_name,phone,address_line,city,province,postal_code,district,label,is_default,rajaongkir_destination_id,rajaongkir_destination_label,rajaongkir_destination_verified_at)
 values(p_id,p_user_id,btrim(p_address->>'recipient_name'),btrim(p_address->>'phone'),btrim(p_address->>'address_line'),city,province,postal_code,district,btrim(p_address->>'label'),make_default,p_destination_id,selected,clock_timestamp())
 on conflict(id) do update set recipient_name=excluded.recipient_name,phone=excluded.phone,address_line=excluded.address_line,
  city=excluded.city,province=excluded.province,postal_code=excluded.postal_code,district=excluded.district,label=excluded.label,
  is_default=excluded.is_default,rajaongkir_destination_id=excluded.rajaongkir_destination_id,
  rajaongkir_destination_label=excluded.rajaongkir_destination_label,rajaongkir_destination_verified_at=excluded.rajaongkir_destination_verified_at
 where public.addresses.user_id=p_user_id;
 if not found then raise exception 'Choose your own saved address' using errcode='42501'; end if;
 return p_id;
end $$;
revoke all on function private.save_verified_shipping_address(uuid,uuid,jsonb,text,bigint) from public,anon,authenticated;

create function public.save_verified_shipping_address(p_user_id uuid,p_id uuid,p_address jsonb,p_cache_key text,p_destination_id bigint)
returns uuid language sql security definer set search_path='' as $$
 select private.save_verified_shipping_address(p_user_id,p_id,p_address,p_cache_key,p_destination_id)
$$;
revoke all on function public.save_verified_shipping_address(uuid,uuid,jsonb,text,bigint) from public,anon,authenticated;
grant execute on function public.save_verified_shipping_address(uuid,uuid,jsonb,text,bigint) to service_role;
