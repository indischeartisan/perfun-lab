-- Included inside each test transaction only. It creates real, owned quote rows and rolls back with the test.
update private.shipping_feature_settings set enabled=true;
create table private.checkout_test_quote_tokens (
 quote_token text primary key,
 user_id uuid not null,
 quote_id uuid not null
);
revoke all on private.checkout_test_quote_tokens from public,anon,authenticated;
create function public.quote_order(p_address_id uuid,p_items jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); quote jsonb; review jsonb;
begin
 update private.shipping_origin_settings
 set status='active',origin_destination_id=900001,origin_destination_label='{"name":"Test origin"}',version=version+1,
     verified_at=clock_timestamp(),verified_by=owner_id,updated_by=owner_id
 where singleton=true and status='inactive';
 update public.addresses set rajaongkir_destination_id=900002,rajaongkir_destination_label='{"name":"Test destination"}',rajaongkir_destination_verified_at=clock_timestamp() where id=p_address_id and user_id=owner_id and rajaongkir_destination_id is null;
 quote:=private.create_shipping_quote(owner_id,p_address_id,p_items,'jne','JNE','REG',18000,'2 days');
 review:=public.quote_order(p_address_id,p_items,(quote->>'quote_id')::uuid);
 insert into private.checkout_test_quote_tokens(quote_token,user_id,quote_id)
 values(review->>'quote_token',owner_id,(quote->>'quote_id')::uuid)
 on conflict(quote_token) do update set user_id=excluded.user_id,quote_id=excluded.quote_id;
 return review;
end $$;
create function public.place_order(p_address_id uuid,p_items jsonb,p_request_id uuid,p_quote_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare quote_id uuid;
begin
 select q.quote_id into quote_id from private.checkout_test_quote_tokens q where q.quote_token=p_quote_token and q.user_id=auth.uid();
 if quote_id is null then raise exception 'Test shipping quote missing' using errcode='23514'; end if;
 return public.place_order(p_address_id,p_items,quote_id,p_request_id,p_quote_token);
end $$;
revoke all on function public.quote_order(uuid,jsonb),public.place_order(uuid,jsonb,uuid,text) from public,anon;
grant execute on function public.quote_order(uuid,jsonb),public.place_order(uuid,jsonb,uuid,text) to authenticated;
