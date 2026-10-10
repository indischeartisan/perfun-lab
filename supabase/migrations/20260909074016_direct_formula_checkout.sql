create or replace function private.checkout(p_address_id uuid,p_items jsonb,p_request_id uuid,p_quote_token text,p_submit boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 owner_id uuid := auth.uid(); existing public.orders; order_id uuid; order_no text;
 address_data jsonb; line jsonb; product public.products; normal_price bigint; launch_price bigint; unit_price bigint;
 qty integer; formula jsonb; phase_name text; note_data jsonb; formula_notes jsonb; bottle_index integer; creation_data jsonb; blend_data jsonb; lines jsonb := '[]';
 subtotal bigint := 0; discount bigint := 0; result jsonb; token text; payload jsonb;
begin
 if owner_id is null or not exists(select 1 from public.profiles where id=owner_id and role<>'vendor') then raise exception 'Sign in required' using errcode='42501'; end if;
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
  if jsonb_typeof(line->'formulas') is distinct from 'array' then raise exception 'Formula data required. Return to Bag and checkout again.' using errcode='23514'; end if;
  if jsonb_array_length(line->'formulas')<>product.bottle_count then raise exception 'Choose % formulas',product.bottle_count using errcode='23514'; end if;
  blend_data := '[]'; bottle_index := 0;
  for formula in select value from jsonb_array_elements(line->'formulas') loop
   if jsonb_typeof(formula) is distinct from 'object' then raise exception 'Invalid formula' using errcode='23514'; end if;
   if (select count(*) from jsonb_object_keys(formula))<>3 or not (formula ?& array['top','middle','base'])
    or jsonb_typeof(formula->'top') is distinct from 'string' or jsonb_typeof(formula->'middle') is distinct from 'string'
    or jsonb_typeof(formula->'base') is distinct from 'string' then raise exception 'Select top, mid and base notes' using errcode='23514'; end if;
   if (select count(distinct value) from jsonb_each_text(formula))<>3 then raise exception 'Use distinct notes; Soapy can appear only once' using errcode='23514'; end if;
   perform 1 from public.notes where id in (formula->>'top',formula->>'middle',formula->>'base') order by id for share;
   formula_notes := '[]';
   foreach phase_name in array array['top','middle','base'] loop
    select to_jsonb(n) into note_data from public.notes n join public.note_phases np on np.note_id=n.id
     where n.id=formula->>phase_name and np.phase=phase_name and n.active and np.enabled for share of n,np;
    if not found then raise exception 'Note unavailable in selected phase. Update your bag formula.' using errcode='23514'; end if;
    formula_notes := formula_notes || jsonb_build_array(jsonb_build_object('phase',phase_name,'note',note_data));
   end loop;
   bottle_index := bottle_index+1;
   creation_data := jsonb_build_object('name','Blend '||bottle_index,'notes',formula_notes);
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


-- Retain the historical JSON column name creations_snapshot: it is a standalone
-- order snapshot, not a reference to the removed tables.
lock table public.creations, public.creation_notes in access exclusive mode;
do $$ begin
 if exists(select 1 from public.creations) or exists(select 1 from public.creation_notes) then
  raise exception 'Creation tables contain data. Export/review those records before retiring them.';
 end if;
end $$;
drop function public.save_creation(uuid,text,text,text,text);
drop table public.creation_notes;
drop table public.creations;
drop function private.check_creation_complete();
drop function private.validate_selected_note_phase();
