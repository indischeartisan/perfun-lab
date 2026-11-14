-- Local-only contract test for the admin order projection.
-- Run with the Supabase SQL test runner after applying migrations locally.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);

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
  payload := public.admin_orders('STG-10ML-PRODUCTION',null,null,null,0);
  row := payload->'rows'->0;
  single_blend := row->'products'->0->'blends';
  if jsonb_array_length(single_blend)<>1 then raise exception 'Single Blend snapshot missing'; end if;
  if (single_blend->0->>'label') is null or jsonb_array_length(single_blend->0->'notes')<>3 then raise exception 'Single Blend notes missing'; end if;

  payload := public.admin_orders('STG-PLAYSET-PAYOUT',null,null,null,0);
  row := payload->'rows'->0;
  play_set := row->'products'->0->'blends';
  if jsonb_array_length(play_set)<>3 then raise exception 'Play Set grouping missing'; end if;

  update public.order_items set creations_snapshot='[]'::jsonb where id='6a500000-0000-4000-8000-000000000001';
  payload := public.admin_orders('STG-10ML-PRODUCTION',null,null,null,0);
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
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000002',true);
do $$ begin
  begin
    perform public.admin_orders('',null,null,null,0);
    raise exception 'Non-admin accessed admin_orders';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
