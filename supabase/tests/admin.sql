-- Disposable fixtures; all writes rolled back, including catalog changes.
begin;
\ir supabase/tests/checkout_test_helpers.sql
insert into auth.users(id,email) values
 ('a1000000-0000-4000-8000-000000000001','admin-test@example.invalid'),
 ('a1000000-0000-4000-8000-000000000002','admin-customer@example.invalid'),
 ('a1000000-0000-4000-8000-000000000003','admin-vendor@example.invalid'),
 ('a1000000-0000-4000-8000-000000000004','admin-perfumer@example.invalid');
update public.profiles set role='admin' where id='a1000000-0000-4000-8000-000000000001';
update public.profiles set role='vendor' where id='a1000000-0000-4000-8000-000000000003';
update public.profiles set role='perfumer' where id='a1000000-0000-4000-8000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000002',true);
select public.save_address('a3000000-0000-4000-8000-000000000001','{"recipient_name":"Test Customer","phone":"08123456","address_line":"Original street","city":"Bandung","province":"Jawa Barat","postal_code":"40111","label":"Home"}');
do $$ declare q jsonb; items jsonb:='[{"product_id":"10ml","formulas":[{"top":"yuzu","middle":"matcha","base":"vanilla"}],"quantity":2}]'; begin
 q:=public.quote_order('a3000000-0000-4000-8000-000000000001',items);
 perform public.place_order('a3000000-0000-4000-8000-000000000001',items,'a4000000-0000-4000-8000-000000000001',q->>'quote_token');
end $$;
reset role;
update public.orders set order_number='ADMIN-MVP-TEST' where user_id='a1000000-0000-4000-8000-000000000002';
create temp table admin_before as select to_jsonb(o) snapshot from public.orders o where order_number='ADMIN-MVP-TEST';
create temp table admin_items_before as select to_jsonb(i) snapshot from public.order_items i join public.orders o on o.id=i.order_id where o.order_number='ADMIN-MVP-TEST';
-- Check all public entry points for every unauthorized role, including forged metadata.
set local role authenticated;
do $$ declare uid uuid; begin
 foreach uid in array array['a1000000-0000-4000-8000-000000000002'::uuid,'a1000000-0000-4000-8000-000000000003'::uuid,'a1000000-0000-4000-8000-000000000004'::uuid] loop
  perform set_config('request.jwt.claim.sub',uid::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'user_metadata',jsonb_build_object('role','admin'))::text,true);
  begin perform public.admin_overview(); raise exception 'Unauthorized overview'; exception when insufficient_privilege then null; end;
  begin perform public.admin_orders(); raise exception 'Unauthorized orders'; exception when insufficient_privilege then null; end;
  begin perform public.admin_customers(); raise exception 'Unauthorized customers'; exception when insufficient_privilege then null; end;
  begin perform public.admin_catalog(); raise exception 'Unauthorized catalog'; exception when insufficient_privilege then null; end;
  begin perform public.admin_save_note('yuzu',1,true,'x','x','[]'); raise exception 'Unauthorized note mutation'; exception when insufficient_privilege then null; end;
  begin perform public.admin_save_product('10ml',1,true,1,1); raise exception 'Unauthorized pricing'; exception when insufficient_privilege then null; end;
 end loop;
end $$;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
do $$ declare c jsonb; n jsonb; v bigint; settings jsonb; asset text; begin
 c:=public.admin_catalog();
 if jsonb_array_length(c->'products')<>3 then raise exception 'Missing catalog'; end if;
 if (public.admin_orders('ADMIN-MVP-TEST','pending','not_started','not_created')->>'count')::int<>1 then raise exception 'Order filters failed'; end if;
 if jsonb_array_length(public.admin_orders('ADMIN-MVP-TEST',null,null,null,1)->'rows')<>0 then raise exception 'Pagination failed'; end if;
 if (public.admin_customers('admin-customer')->'rows'->0->>'total_orders')::int<>1 then raise exception 'Customer count failed'; end if;
 if (select count(*) from jsonb_object_keys(public.admin_customers('admin-customer')->'rows'->0))<>5 then raise exception 'Excess customer fields'; end if;
 begin perform public.admin_orders('', 'bad'); raise exception 'Invalid filter accepted'; exception when invalid_parameter_value then null; end;
 begin update public.notes set active=false where id='yuzu'; raise exception 'Direct catalog mutation'; exception when insufficient_privilege then null; end;
 begin update public.product_prices set amount=1; raise exception 'Direct price mutation'; exception when insufficient_privilege then null; end;
 select value into n from jsonb_array_elements(c->'notes') where value->>'id'='yuzu';
 v:=(n->>'version')::bigint; asset:=n->>'sticker_asset';
 settings:='[{"phase":"top","enabled":false,"sort_order":9},{"phase":"middle","enabled":true,"sort_order":4},{"phase":"base","enabled":false,"sort_order":0}]';
 perform public.admin_save_note('yuzu',v,true,'Edited category','Edited descriptor',settings);
 if (select enabled from public.note_phases where note_id='yuzu' and phase='top') then raise exception 'Phase not disabled'; end if;
 if (select sticker_asset from public.notes where id='yuzu') is distinct from asset then raise exception 'Asset changed'; end if;
 begin perform public.admin_save_note('yuzu',v,true,'x','x',settings); raise exception 'Stale note overwrite'; exception when serialization_failure then null; end;
 select version into v from public.notes where id='soapy';
 begin perform public.admin_save_note('soapy',v,true,'x','x',settings); raise exception 'Soapy phases lost'; exception when check_violation then null; end;
 select version into v from public.products where id='10ml';
 begin perform public.admin_save_product('10ml',v,true,100,101); raise exception 'Sale above regular'; exception when check_violation then null; end;
 begin perform public.admin_save_product('10ml',v,true,0,null); raise exception 'Zero regular'; exception when check_violation then null; end;
 perform public.admin_save_product('10ml',v,false,135000,null);
 if exists(select 1 from public.product_prices where product_id='10ml' and kind='launch') then raise exception 'Sale not removed'; end if;
 begin perform public.admin_save_product('10ml',v,true,135000,110000); raise exception 'Stale product overwrite'; exception when serialization_failure then null; end;
 perform public.admin_save_product('10ml',v+1,true,135000,110000);
end $$;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000002',true);
do $$ begin
 begin perform public.quote_order('a3000000-0000-4000-8000-000000000001','[{"product_id":"10ml","formulas":[{"top":"yuzu","middle":"matcha","base":"vanilla"}],"quantity":1}]'); raise exception 'Disabled phase checked out'; exception when raise_exception or check_violation then if sqlerrm='Disabled phase checked out' then raise; end if; end;
end $$;
reset role;
do $$ begin
 if (select snapshot from admin_before) is distinct from (select to_jsonb(o) from public.orders o where order_number='ADMIN-MVP-TEST') then raise exception 'Historical order changed'; end if;
 if (select snapshot from admin_items_before) is distinct from (select to_jsonb(i) from public.order_items i join public.orders o on o.id=i.order_id where o.order_number='ADMIN-MVP-TEST') then raise exception 'Historical items changed'; end if;
end $$;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
create temp table admin_metrics_before as select public.admin_overview() data;
set local role service_role;
do $$ declare p jsonb; oid uuid; begin
 select id into oid from public.orders where order_number='ADMIN-MVP-TEST';
 p:=public.reserve_payment(oid,'a1000000-0000-4000-8000-000000000002','doku','sandbox','https://example.invalid');
 perform public.apply_payment_event((p->>'id')::uuid,'admin-test-paid',(p->>'amount')::bigint,'paid',now(),'{}');
 perform public.apply_payment_event((p->>'id')::uuid,'admin-test-paid',(p->>'amount')::bigint,'paid',now(),'{}');
end $$;
reset role;
do $$ declare b jsonb; a jsonb; o public.orders; begin
 select data into b from admin_metrics_before; a:=public.admin_overview(); select * into o from public.orders where order_number='ADMIN-MVP-TEST';
 if (a->>'paid_orders')::bigint-(b->>'paid_orders')::bigint<>1 or
 (a->>'paid_gross_sales')::bigint-(b->>'paid_gross_sales')::bigint<>o.subtotal or
 (a->>'discounts')::bigint-(b->>'discounts')::bigint<>o.discount or
 (a->>'net_transaction_total')::bigint-(b->>'net_transaction_total')::bigint<>o.grand_total then raise exception 'Revenue aggregation incorrect'; end if;
 if (public.admin_orders('ADMIN-MVP-TEST','paid','queued','pending')->>'count')::int<>1 then raise exception 'Paid operational filters failed'; end if;
 update public.orders set payment_status='refunded' where id=o.id;
 a:=public.admin_overview();
 if (a->>'paid_gross_sales')::bigint<>(b->>'paid_gross_sales')::bigint then raise exception 'Refund included in revenue'; end if;
end $$;
update public.profiles set role='customer' where id='a1000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin begin perform public.admin_overview(); raise exception 'Revoked admin accepted'; exception when insufficient_privilege then null; end; end $$;
set local role anon;
do $$ begin begin perform public.admin_catalog(); raise exception 'Anonymous admin accepted'; exception when insufficient_privilege then null; end; end $$;
reset role;
set constraints all immediate;
rollback;
select 'PASS: admin authorization, filters, minimal customer data, pricing validation, optimistic edits, disabled phases, immutable snapshots, paid revenue and retry handling' result;
