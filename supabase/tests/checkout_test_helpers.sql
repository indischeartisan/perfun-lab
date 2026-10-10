-- Included inside each test transaction only. It creates real, owned quote rows and rolls back with the test.
update private.shipping_feature_settings set enabled=true;
create function public.quote_order(p_address_id uuid,p_items jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); quote jsonb;
begin
 update private.shipping_origin_settings
 set status='active',origin_destination_id=900001,origin_destination_label='{"name":"Test origin"}',version=version+1,
     verified_at=clock_timestamp(),verified_by=owner_id,updated_by=owner_id
 where singleton=true and status='inactive';
 update public.addresses set rajaongkir_destination_id=900002,rajaongkir_destination_label='{"name":"Test destination"}',rajaongkir_destination_verified_at=clock_timestamp() where id=p_address_id and user_id=owner_id and rajaongkir_destination_id is null;
 quote:=private.create_shipping_quote(owner_id,p_address_id,p_items,'jne','JNE','REG',18000,'2 days');
 return public.quote_order(p_address_id,p_items,(quote->>'quote_id')::uuid);
end $$;
create function public.place_order(p_address_id uuid,p_items jsonb,p_request_id uuid,p_quote_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare quote_id uuid;
begin
 select id into quote_id from private.shipping_quotes where user_id=auth.uid() and address_id=p_address_id and items_fingerprint=private.shipping_digest(p_items) order by created_at desc limit 1;
 if quote_id is null then raise exception 'Test shipping quote missing' using errcode='23514'; end if;
 return public.place_order(p_address_id,p_items,quote_id,p_request_id,p_quote_token);
end $$;
revoke all on function public.quote_order(uuid,jsonb),public.place_order(uuid,jsonb,uuid,text) from public,anon;
grant execute on function public.quote_order(uuid,jsonb),public.place_order(uuid,jsonb,uuid,text) to authenticated;
