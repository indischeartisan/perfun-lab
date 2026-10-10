-- Phase 5C: checkout can only create a new order from an active, owned, unexpired shipping quote.
alter table public.orders add column if not exists shipping_quote_snapshot jsonb;
alter table public.orders add constraint orders_shipping_quote_snapshot_object
 check(shipping_quote_snapshot is null or jsonb_typeof(shipping_quote_snapshot)='object');
alter table private.shipping_quotes add column if not exists consumed_order_id uuid unique;
alter table private.shipping_quotes add column if not exists consumed_at timestamptz;
alter table private.shipping_quotes add constraint shipping_quotes_consumed_pair
 check((consumed_order_id is null and consumed_at is null) or (consumed_order_id is not null and consumed_at is not null));

create function private.shipping_feature_ready()
returns boolean language sql security definer set search_path='' as $$
 select exists(select 1 from private.shipping_feature_settings f join private.shipping_origin_settings o on o.singleton=true where f.singleton=true and f.enabled and o.status='active' and o.origin_destination_id is not null)
$$;
revoke all on function private.shipping_feature_ready() from public,anon,authenticated;
create function public.shipping_feature_ready()
returns boolean language sql security definer set search_path='' as $$ select private.shipping_feature_ready(); $$;
revoke all on function public.shipping_feature_ready() from public,anon,authenticated;
grant execute on function public.shipping_feature_ready() to service_role;

-- The old public signatures must not remain a Rp0 bypass once shipping checkout exists.
drop function if exists public.quote_order(uuid,jsonb);
drop function if exists public.place_order(uuid,jsonb,uuid,text);
drop function if exists private.checkout(uuid,jsonb,uuid,text,boolean);

create function private.checkout(p_address_id uuid,p_items jsonb,p_shipping_quote_id uuid,p_request_id uuid,p_quote_token text,p_submit boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 owner_id uuid:=auth.uid(); existing public.orders; order_id uuid; order_no text; address public.addresses; shipment private.shipping_quotes;
 feature private.shipping_feature_settings; origin private.shipping_origin_settings; profile private.shipping_package_profiles;
 address_data jsonb; line jsonb; product public.products; normal_price bigint; launch_price bigint; unit_price bigint; qty integer;
 formula jsonb; phase_name text; note_data jsonb; formula_notes jsonb; bottle_index integer; creation_data jsonb; blend_data jsonb:='[]'; lines jsonb:='[]';
 subtotal bigint:=0; discount bigint:=0; result jsonb; token text; payload jsonb; calculated_weight jsonb; shipping_snapshot jsonb;
begin
 if owner_id is null or not exists(select 1 from public.profiles where id=owner_id and role='customer') then raise exception 'Customer sign in required' using errcode='42501'; end if;
 if p_shipping_quote_id is null then raise exception 'Choose a current shipping service before checkout' using errcode='23514'; end if;
 payload:=jsonb_build_object('address_id',p_address_id,'items',p_items,'shipping_quote_id',p_shipping_quote_id);
 if p_submit then
  if p_request_id is null then raise exception 'Request ID required' using errcode='23514'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text||p_request_id::text,0));
  select * into existing from public.orders where user_id=owner_id and request_id=p_request_id;
  if found then if existing.request_payload<>payload then raise exception 'Request ID already used for another checkout' using errcode='23514'; end if; return jsonb_build_object('order_id',existing.id); end if;
 end if;
 select * into feature from private.shipping_feature_settings where singleton=true for share;
 if feature.enabled is distinct from true then raise exception 'Shipping checkout is not enabled. No order was created.' using errcode='23514'; end if;
 select * into origin from private.shipping_origin_settings where singleton=true for share;
 if origin.status<>'active' or origin.origin_destination_id is null then raise exception 'Shipping origin is not verified. No order was created.' using errcode='23514'; end if;
 select * into profile from private.shipping_package_profiles where active for share;
 if not found then raise exception 'Shipping package profile is unavailable' using errcode='23514'; end if;
 select * into address from public.addresses where id=p_address_id and user_id=owner_id for share;
 if not found then raise exception 'Choose your own saved address' using errcode='42501'; end if;
 select * into shipment from private.shipping_quotes where id=p_shipping_quote_id and user_id=owner_id for update;
 if not found then raise exception 'Shipping quote not found' using errcode='42501'; end if;
 if shipment.consumed_order_id is not null or shipment.expires_at<=clock_timestamp() then raise exception 'Shipping quote expired or was already used. Choose shipping again.' using errcode='23514'; end if;
 if shipment.address_id<>address.id or shipment.address_fingerprint<>private.shipping_digest(to_jsonb(address)) or shipment.items_fingerprint<>private.shipping_digest(p_items)
  or shipment.origin_version<>origin.version or shipment.origin_destination_id<>origin.origin_destination_id or shipment.package_profile_version<>profile.profile_version
  or shipment.destination_id<>address.rajaongkir_destination_id or shipment.destination_label<>address.rajaongkir_destination_label then raise exception 'Shipping quote no longer matches this checkout. Choose shipping again.' using errcode='23514'; end if;
 calculated_weight:=private.shipping_weight_for_items(p_items);
 if (calculated_weight->>'weight_grams')::integer<>shipment.weight_grams then raise exception 'Shipping weight changed. Choose shipping again.' using errcode='23514'; end if;
 address_data:=jsonb_build_object('recipient_name',address.recipient_name,'phone',address.phone,'address_line',address.address_line,'city',address.city,'province',address.province,'postal_code',address.postal_code,'label',address.label,'district',address.district,'delivery_note',address.delivery_note);
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 50 then raise exception 'Select order items' using errcode='23514'; end if;
 for line in select value from jsonb_array_elements(p_items) loop
  if coalesce(line->>'quantity','') !~ '^[1-9][0-9]?$' then raise exception 'Quantity must be 1 to 99' using errcode='23514'; end if;
  qty:=(line->>'quantity')::integer; select * into product from public.products where id=line->>'product_id' and active for share;
  if not found or product.id not in ('10ml','30ml','bundle-3x10ml') then raise exception 'Product unavailable' using errcode='23514'; end if;
  select amount into normal_price from public.product_prices where product_id=product.id and kind='normal' for share;
  select amount into launch_price from public.product_prices where product_id=product.id and kind='launch' for share;
  unit_price:=least(normal_price,coalesce(launch_price,normal_price)); if normal_price is null then raise exception 'Price unavailable' using errcode='23514'; end if;
  if jsonb_typeof(line->'formulas') is distinct from 'array' or jsonb_array_length(line->'formulas')<>product.bottle_count then raise exception 'Choose % formulas',product.bottle_count using errcode='23514'; end if;
  blend_data:='[]'; bottle_index:=0;
  for formula in select value from jsonb_array_elements(line->'formulas') loop
   if jsonb_typeof(formula) is distinct from 'object' or (select count(*) from jsonb_object_keys(formula))<>3 or not (formula ?& array['top','middle','base'])
    or jsonb_typeof(formula->'top') is distinct from 'string' or jsonb_typeof(formula->'middle') is distinct from 'string' or jsonb_typeof(formula->'base') is distinct from 'string'
    or (select count(distinct value) from jsonb_each_text(formula))<>3 then raise exception 'Select distinct top, mid and base notes' using errcode='23514'; end if;
   formula_notes:='[]'; foreach phase_name in array array['top','middle','base'] loop
    select to_jsonb(n) into note_data from public.notes n join public.note_phases np on np.note_id=n.id where n.id=formula->>phase_name and np.phase=phase_name and n.active and np.enabled for share of n,np;
    if not found then raise exception 'Note unavailable in selected phase. Update your bag formula.' using errcode='23514'; end if;
    formula_notes:=formula_notes||jsonb_build_array(jsonb_build_object('phase',phase_name,'note',note_data));
   end loop;
   bottle_index:=bottle_index+1; blend_data:=blend_data||jsonb_build_array(jsonb_build_object('name','Blend '||bottle_index,'notes',formula_notes));
  end loop;
  lines:=lines||jsonb_build_array(jsonb_build_object('product_snapshot',to_jsonb(product),'creations_snapshot',blend_data,'quantity',qty,'normal_unit_price',normal_price,'unit_price',unit_price,'line_total',unit_price*qty));
  subtotal:=subtotal+normal_price*qty; discount:=discount+(normal_price-unit_price)*qty;
 end loop;
 shipping_snapshot:=jsonb_build_object('quote_id',shipment.id,'origin_version',shipment.origin_version,'package_profile_version',shipment.package_profile_version,'origin_destination_id',shipment.origin_destination_id,'destination_id',shipment.destination_id,'destination_label',shipment.destination_label,'weight_grams',shipment.weight_grams,'courier_code',shipment.courier_code,'courier_name',shipment.courier_name,'service',shipment.service,'amount',shipment.amount,'etd',shipment.etd,'expires_at',shipment.expires_at);
 result:=jsonb_build_object('address_snapshot',address_data,'items',lines,'subtotal',subtotal,'discount',discount,'shipping',shipment.amount,'grand_total',subtotal-discount+shipment.amount,'currency','IDR','shipping_quote_snapshot',shipping_snapshot);
 token:=md5(result::text);
 if not p_submit then return result||jsonb_build_object('quote_token',token); end if;
 if p_quote_token is distinct from token then raise exception 'Checkout changed. Review the latest details and prices again.' using errcode='P0001'; end if;
 order_id:=gen_random_uuid(); order_no:='PF-'||upper(replace(order_id::text,'-',''));
 insert into public.orders(id,order_number,user_id,request_id,request_payload,address_snapshot,subtotal,discount,shipping,grand_total,shipping_quote_snapshot)
 values(order_id,order_no,owner_id,p_request_id,payload,address_data,subtotal,discount,shipment.amount,subtotal-discount+shipment.amount,shipping_snapshot);
 update private.shipping_quotes set consumed_order_id=order_id,consumed_at=clock_timestamp() where id=shipment.id and consumed_order_id is null;
 if not found then raise exception 'Shipping quote was already used. No order was created.' using errcode='23514'; end if;
 insert into public.order_items(order_id,position,product_snapshot,creations_snapshot,quantity,normal_unit_price,unit_price,line_total)
 select order_id,ordinality::integer,value->'product_snapshot',value->'creations_snapshot',(value->>'quantity')::integer,(value->>'normal_unit_price')::bigint,(value->>'unit_price')::bigint,(value->>'line_total')::bigint from jsonb_array_elements(lines) with ordinality;
 return jsonb_build_object('order_id',order_id);
end $$;
revoke all on function private.checkout(uuid,jsonb,uuid,uuid,text,boolean) from public,anon,authenticated;

create function public.quote_order(p_address_id uuid,p_items jsonb,p_shipping_quote_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.checkout(p_address_id,p_items,p_shipping_quote_id,null,null,false); $$;
create function public.place_order(p_address_id uuid,p_items jsonb,p_shipping_quote_id uuid,p_request_id uuid,p_quote_token text) returns jsonb language sql security invoker set search_path='' as $$ select private.checkout(p_address_id,p_items,p_shipping_quote_id,p_request_id,p_quote_token,true); $$;
revoke all on function public.quote_order(uuid,jsonb,uuid),public.place_order(uuid,jsonb,uuid,uuid,text) from public,anon;
grant execute on function public.quote_order(uuid,jsonb,uuid),public.place_order(uuid,jsonb,uuid,uuid,text) to authenticated;
