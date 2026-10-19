-- Disposable local database only. All fixture writes roll back.
begin;
do $$ begin
 if (select prosecdef from pg_proc where oid='public.list_vendor_production_orders(text,timestamptz,text)'::regprocedure) then raise exception 'Projection must use security invoker'; end if;
 if has_function_privilege('anon','public.list_vendor_production_orders(text,timestamptz,text)','execute') then raise exception 'Anon execute grant exists'; end if;
 if not has_function_privilege('authenticated','public.list_vendor_production_orders(text,timestamptz,text)','execute') then raise exception 'Authenticated execute grant missing'; end if;
end $$;
insert into auth.users(id,email) values
 ('c1000000-0000-4000-8000-000000000001','projection-customer@example.invalid'),
 ('c1000000-0000-4000-8000-000000000002','projection-admin@example.invalid'),
 ('c1000000-0000-4000-8000-000000000003','projection-vendor-a@example.invalid'),
 ('c1000000-0000-4000-8000-000000000004','projection-vendor-b@example.invalid'),
 ('c1000000-0000-4000-8000-000000000005','projection-perfumer@example.invalid');
update public.profiles set role='admin' where id='c1000000-0000-4000-8000-000000000002';
update public.profiles set role='vendor' where id in ('c1000000-0000-4000-8000-000000000003','c1000000-0000-4000-8000-000000000004');
update public.profiles set role='perfumer' where id='c1000000-0000-4000-8000-000000000005';
insert into public.orders(id,order_number,user_id,request_id,request_payload,address_snapshot,subtotal,discount,shipping,grand_total)
select md5('projection-order-'||n)::uuid,
 case when n=25 then 'PROJECTION-025-'||repeat('x',201) else 'PROJECTION-'||lpad(n::text,3,'0') end,
 'c1000000-0000-4000-8000-000000000001',gen_random_uuid(),'{}','{"recipient_name":"PRIVATE CUSTOMER"}',500000,0,0,500000
from generate_series(1,28) n;
insert into public.order_items(id,order_id,position,product_snapshot,creations_snapshot,quantity,normal_unit_price,unit_price,line_total)
select md5('projection-item-'||n)::uuid,md5('projection-order-'||n)::uuid,1,
 '{"id":"10ml","label":"10 ML","volume_ml":10,"bottle_count":1}',
 '[{"notes":[{"phase":"top","note":{"name":"Yuzu"}},{"phase":"middle","note":{"name":"Tea"}},{"phase":"base","note":{"name":"Musk"}}]}]',
 1,50000,50000,50000 from generate_series(1,28) n;
insert into public.order_items(id,order_id,position,product_snapshot,creations_snapshot,quantity,normal_unit_price,unit_price,line_total) values
 (md5('projection-extra-30')::uuid,md5('projection-order-25')::uuid,2,'{"id":"30ml","label":"30 ML","volume_ml":30,"bottle_count":1}',
 '[{"notes":[{"phase":"top","note":{"name":"Pear"}},{"phase":"middle","note":{"name":"Rose"}},{"phase":"base","note":{"name":"Cedar"}}]}]',1,50000,50000,50000),
 (md5('projection-extra-play')::uuid,md5('projection-order-25')::uuid,3,'{"id":"bundle-3x10ml","label":"Play Set","volume_ml":10,"bottle_count":3}',
 '[{"notes":[{"phase":"top","note":{"name":"One"}}]},{"notes":[{"phase":"top","note":{"name":"Two"}}]},{"notes":[{"phase":"top","note":{"name":"Three"}}]}]',1,50000,50000,50000);
update public.orders set payment_status='paid',status='paid' where order_number like 'PROJECTION-%';
set local role authenticated;
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000002',true);
do $$ begin
 for n in 1..28 loop
  perform public.admin_assign_vendor(md5('projection-order-'||n)::uuid,case when n=28 then 'c1000000-0000-4000-8000-000000000004'::uuid else 'c1000000-0000-4000-8000-000000000003'::uuid end);
 end loop;
end $$;
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000003',true);
do $$ declare first_page jsonb; second_page jsonb; multi jsonb; running jsonb; job_id uuid; begin
 first_page:=public.list_vendor_production_orders('queued');
 if jsonb_array_length(first_page->'rows')<>25 or first_page->>'has_more'<>'true' then raise exception 'Order pagination first page invalid'; end if;
 multi:=first_page->'rows'->24;
 if multi->>'order_number'<>'PROJECTION-025-'||repeat('x',201) or jsonb_array_length(multi->'jobs')<>3 then raise exception 'Boundary order lost jobs'; end if;
 if not exists(select 1 from jsonb_array_elements(multi->'jobs') j where j->'product_snapshot'->>'volume_ml'='30') then raise exception '30 ml item missing'; end if;
 if not exists(select 1 from jsonb_array_elements(multi->'jobs') j where j->'formulas_snapshot'->0->>'top'='One' and j->'formulas_snapshot'->1->>'top'='Two' and j->'formulas_snapshot'->2->>'top'='Three') then raise exception 'Play Set formulas not independent'; end if;
 if first_page::text like '%PRIVATE CUSTOMER%' or first_page::text like '%500000%' or first_page::text like '%PROJECTION-028%' then raise exception 'Projection exposed private or other vendor data'; end if;
 second_page:=public.list_vendor_production_orders('queued',(first_page->'next_cursor'->>'ordered_at')::timestamptz,first_page->'next_cursor'->>'order_number');
 if jsonb_array_length(second_page->'rows')<>2 or second_page->>'has_more'<>'false' then raise exception 'Order pagination second page invalid'; end if;
 if jsonb_array_length(public.list_vendor_production_orders('queued', '1900-01-01T00:00:00Z'::timestamptz, '')->'rows')<>25 then raise exception 'Empty order-number cursor rejected'; end if;
 begin perform public.list_vendor_production_orders('queued',now(),null); raise exception 'Invalid cursor accepted'; exception when invalid_parameter_value then null; end;
 select id into job_id from public.production_jobs where order_item_id=md5('projection-item-25')::uuid;
 perform public.advance_production_job(job_id,'start');
 running:=public.list_vendor_production_orders('in_production');
 if jsonb_array_length(running->'rows')<>1 or jsonb_array_length(running->'rows'->0->'jobs')<>3 then raise exception 'Mixed-state order lost jobs'; end if;
 if not exists(select 1 from jsonb_array_elements(running->'rows'->0->'jobs') j where j->>'status'='in_production') or not exists(select 1 from jsonb_array_elements(running->'rows'->0->'jobs') j where j->>'status'='queued') then raise exception 'Individual job states lost'; end if;
end $$;
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000004',true);
do $$ declare result jsonb; begin
 result:=public.list_vendor_production_orders('queued');
 if jsonb_array_length(result->'rows')<>1 or result->'rows'->0->>'order_number'<>'PROJECTION-028' then raise exception 'Cross-vendor isolation failed'; end if;
end $$;
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
do $$ begin begin perform public.list_vendor_production_orders('queued'); raise exception 'Customer access allowed'; exception when insufficient_privilege then null; end; end $$;
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000002',true);
do $$ begin begin perform public.list_vendor_production_orders('queued'); raise exception 'Admin access allowed'; exception when insufficient_privilege then null; end; end $$;
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000005',true);
do $$ begin begin perform public.list_vendor_production_orders('queued'); raise exception 'Perfumer access allowed'; exception when insufficient_privilege then null; end; end $$;
reset role;
update public.profiles set role='customer' where id='c1000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000003',true);
do $$ begin begin perform public.list_vendor_production_orders('queued'); raise exception 'Revoked vendor access allowed'; exception when insufficient_privilege then null; end; end $$;
reset role;
set local role anon;
do $$ begin begin perform public.list_vendor_production_orders('queued'); raise exception 'Anon access allowed'; exception when insufficient_privilege then null; end; end $$;
reset role;
select 'PASS: order pagination, complete mixed jobs, Play Set snapshots and vendor isolation' result;
rollback;
