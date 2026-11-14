-- Local-only contract test for the admin order projection.
-- Run with the Supabase SQL test runner after applying migrations locally.
begin;
insert into auth.users(id,email) values
 ('a1100000-0000-4000-8000-000000000001','recipe-admin@example.invalid'),
 ('a1100000-0000-4000-8000-000000000002','recipe-customer@example.invalid');
update public.profiles set role='admin' where id='a1100000-0000-4000-8000-000000000001';

insert into public.orders(id,order_number,user_id,request_id,request_payload,address_snapshot,subtotal,discount,shipping,grand_total,payment_status,status)
values
 ('a1300000-0000-4000-8000-000000000001','TEST-10ML-RECIPE','a1100000-0000-4000-8000-000000000002','a1400000-0000-4000-8000-000000000001','{}','{}',100000,0,0,100000,'paid','paid'),
 ('a1300000-0000-4000-8000-000000000002','TEST-PLAYSET-RECIPE','a1100000-0000-4000-8000-000000000002','a1400000-0000-4000-8000-000000000002','{}','{}',300000,0,0,300000,'paid','paid'),
 ('a1300000-0000-4000-8000-000000000003','TEST-NO-SNAPSHOT','a1100000-0000-4000-8000-000000000002','a1400000-0000-4000-8000-000000000003','{}','{}',100000,0,0,100000,'paid','paid');
insert into public.order_items(id,order_id,position,product_snapshot,creations_snapshot,quantity,normal_unit_price,unit_price,line_total)
values
 ('a1500000-0000-4000-8000-000000000001','a1300000-0000-4000-8000-000000000001',1,'{"id":"10ml","label":"Blend 1","volume_ml":10,"bottle_count":1}','[{"name":"Blend One","notes":[{"phase":"top","note":{"id":"green-leaves","name":"Green Leaves"}},{"phase":"middle","note":{"id":"tea","name":"Tea"}},{"phase":"base","note":{"id":"honey","name":"Honey"}}]}]',1,100000,100000,100000),
 ('a1500000-0000-4000-8000-000000000002','a1300000-0000-4000-8000-000000000002',1,'{"id":"bundle-3x10ml","label":"Play Set","volume_ml":10,"bottle_count":3}','[{"name":"Parfum One","notes":[{"phase":"top","note":{"id":"green-leaves","name":"Green Leaves"}},{"phase":"middle","note":{"id":"tea","name":"Tea"}},{"phase":"base","note":{"id":"honey","name":"Honey"}}]},{"name":"Parfum Two","notes":[{"phase":"top","note":{"id":"yuzu","name":"Yuzu"}},{"phase":"middle","note":{"id":"matcha","name":"Matcha"}},{"phase":"base","note":{"id":"vanilla","name":"Vanilla"}}]},{"name":"Parfum Three","notes":[{"phase":"top","note":{"id":"soapy","name":"Soapy"}},{"phase":"middle","note":{"id":"matcha","name":"Matcha"}},{"phase":"base","note":{"id":"vanilla","name":"Vanilla"}}]}]',1,300000,300000,300000),
 ('a1500000-0000-4000-8000-000000000003','a1300000-0000-4000-8000-000000000003',1,'{"id":"10ml","label":"Blend without snapshot","volume_ml":10,"bottle_count":1}','[]'::jsonb,1,100000,100000,100000);
set local role authenticated;
select set_config('request.jwt.claim.sub','a1100000-0000-4000-8000-000000000001',true);

do $$
declare
  payload jsonb;
  row jsonb;
  product jsonb;
  blend jsonb;
  note jsonb;
  single_blend jsonb;
  play_set jsonb;
begin
  payload := public.admin_orders('TEST-10ML-RECIPE',null,null,null,0);
  row := payload->'rows'->0;
  single_blend := row->'products'->0->'blends';
  if jsonb_array_length(single_blend)<>1 then raise exception 'Single Blend snapshot missing'; end if;
  if (single_blend->0->>'label') is null or jsonb_array_length(single_blend->0->'notes')<>3 then raise exception 'Single Blend notes missing'; end if;

  payload := public.admin_orders('TEST-PLAYSET-RECIPE',null,null,null,0);
  row := payload->'rows'->0;
  play_set := row->'products'->0->'blends';
  if jsonb_array_length(play_set)<>3 then raise exception 'Play Set grouping missing'; end if;

  payload := public.admin_orders('TEST-NO-SNAPSHOT',null,null,null,0);
  if jsonb_array_length(payload->'rows'->0->'products'->0->'blends')<>0 then raise exception 'Missing snapshot was not preserved as empty'; end if;

  payload := public.admin_orders('',null,null,null,0);
  for row in select value from jsonb_array_elements(payload->'rows') loop
    for product in select value from jsonb_array_elements(row->'products') loop
      if jsonb_typeof(product->'blends') is distinct from 'array' then raise exception 'Recipe blends projection missing'; end if;
      for blend in select value from jsonb_array_elements(product->'blends') loop
        for note in select value from jsonb_array_elements(blend->'notes') loop
          if note ? 'phase' and note ? 'id' and note ? 'name' then continue; end if;
          raise exception 'Recipe note projection is not minimal';
        end loop;
      end loop;
    end loop;
  end loop;
end $$;

-- The public function remains admin-only even when a non-admin forges user metadata.
select set_config('request.jwt.claim.sub','a1100000-0000-4000-8000-000000000002',true);
do $$ begin
  begin
    perform public.admin_orders('',null,null,null,0);
    raise exception 'Non-admin accessed admin_orders';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
