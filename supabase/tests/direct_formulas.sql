begin;
\ir checkout_test_helpers.sql
insert into auth.users(id,email) values('b9100000-0000-4000-8000-000000000001','direct-formula@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub','b9100000-0000-4000-8000-000000000001',true);
select public.save_address('b9200000-0000-4000-8000-000000000001','{"recipient_name":"Formula Test","phone":"0812345678","address_line":"Snapshot street","city":"Bandung","province":"Jawa Barat","postal_code":"40111","label":"Home"}');
do $$ declare f jsonb; q jsonb; oid uuid; items jsonb; begin
 foreach f in array array[
  '{"top":"soapy","middle":"matcha","base":"vanilla"}'::jsonb,
  '{"top":"yuzu","middle":"soapy","base":"vanilla"}'::jsonb,
  '{"top":"yuzu","middle":"matcha","base":"soapy"}'::jsonb
 ] loop
  q:=public.quote_order('b9200000-0000-4000-8000-000000000001',jsonb_build_array(jsonb_build_object('product_id','10ml','quantity',1,'formulas',jsonb_build_array(f))));
  if jsonb_array_length(q->'items'->0->'creations_snapshot'->0->'notes')<>3 then raise exception 'Soapy phase rejected'; end if;
 end loop;
 foreach f in array array[
  '{"top":"soapy","middle":"soapy","base":"vanilla"}'::jsonb,
  '{"top":"vanilla","middle":"matcha","base":"yuzu"}'::jsonb,
  '{"top":"missing","middle":"matcha","base":"vanilla"}'::jsonb,
  '{"top":"yuzu","middle":"matcha"}'::jsonb,
  '{"top":"yuzu","middle":"matcha","base":"vanilla","name":"forged"}'::jsonb,
  '{"top":null,"middle":"matcha","base":"vanilla"}'::jsonb,
  '[]'::jsonb
 ] loop
  begin perform public.quote_order('b9200000-0000-4000-8000-000000000001',jsonb_build_array(jsonb_build_object('product_id','10ml','quantity',1,'formulas',jsonb_build_array(f)))); raise exception 'Invalid formula accepted: %',f; exception when check_violation then null; end;
 end loop;
 begin perform public.quote_order('b9200000-0000-4000-8000-000000000001','[{"product_id":"10ml","quantity":1,"creation_ids":[]}]'); raise exception 'Legacy new checkout accepted'; exception when check_violation then null; end;
 begin perform public.quote_order('b9200000-0000-4000-8000-000000000001','[{"product_id":"10ml","quantity":1,"formulas":[]}]'); raise exception 'Missing bottle accepted'; exception when check_violation then null; end;
 f:='{"top":"yuzu","middle":"matcha","base":"vanilla"}';
 items:=jsonb_build_array(jsonb_build_object('product_id','bundle-3x10ml','quantity',2,'price',1,'grand_total',1,'formulas',jsonb_build_array(f,f,f)));
 q:=public.quote_order('b9200000-0000-4000-8000-000000000001',items);
 if (q->>'grand_total')::bigint<>616000 or jsonb_array_length(q->'items'->0->'creations_snapshot')<>3 then raise exception 'Bundle price or formula count wrong'; end if;
 oid:=(public.place_order('b9200000-0000-4000-8000-000000000001',items,'b9300000-0000-4000-8000-000000000001',q->>'quote_token')->>'order_id')::uuid;
 if (public.place_order('b9200000-0000-4000-8000-000000000001',items,'b9300000-0000-4000-8000-000000000001',q->>'quote_token')->>'order_id')::uuid<>oid then raise exception 'Duplicate order'; end if;
 begin perform public.place_order('b9200000-0000-4000-8000-000000000001',jsonb_set(items,'{0,formulas,0,top}','"mint"'),'b9300000-0000-4000-8000-000000000001',q->>'quote_token'); raise exception 'Conflicting request accepted'; exception when raise_exception or check_violation then if sqlerrm='Conflicting request accepted' then raise; end if; end;
end $$;
reset role;
create temp table formula_quote as select public.quote_order('b9200000-0000-4000-8000-000000000001','[{"product_id":"10ml","quantity":1,"formulas":[{"top":"yuzu","middle":"matcha","base":"vanilla"}]}]') q;
update public.product_prices set amount=amount+1000 where product_id='10ml' and kind='launch';
do $$ declare t text; begin
 select q->>'quote_token' into t from formula_quote;
 begin perform public.place_order('b9200000-0000-4000-8000-000000000001','[{"product_id":"10ml","quantity":1,"formulas":[{"top":"yuzu","middle":"matcha","base":"vanilla"}]}]','b9300000-0000-4000-8000-000000000002',t); raise exception 'Stale price accepted'; exception when raise_exception then if sqlerrm='Stale price accepted' then raise; end if; end;
end $$;
update public.notes set active=false where id='yuzu';
do $$ begin
 begin perform public.quote_order('b9200000-0000-4000-8000-000000000001','[{"product_id":"10ml","quantity":1,"formulas":[{"top":"yuzu","middle":"matcha","base":"vanilla"}]}]'); raise exception 'Inactive note accepted'; exception when check_violation then null; end;
 if (select creations_snapshot->0->'notes'->0->'note'->>'name' from public.order_items where order_id=(select id from public.orders where request_id='b9300000-0000-4000-8000-000000000001'))<>'Yuzu' then raise exception 'Snapshot corrupted'; end if;
end $$;
rollback;
select 'PASS: direct formula validation, Soapy phases and uniqueness, server prices, bundles, duplicate/conflicting requests, stale quote and immutable snapshots' result;
