begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','f5100000-0000-4000-8000-000000000001',true);
do $$ begin
 if not has_function_privilege('authenticated','public.checkout_shipping_readiness()','execute') then raise exception 'Authenticated checkout readiness unavailable'; end if;
 if has_function_privilege('anon','public.checkout_shipping_readiness()','execute') then raise exception 'Anonymous readiness access allowed'; end if;
end $$;
reset role;
update private.shipping_feature_settings set enabled=false where singleton=true;
set local role authenticated;
do $$ declare result jsonb; begin
 result:=public.checkout_shipping_readiness();
 if result is distinct from '{"enabled":false,"ready":false}'::jsonb then raise exception 'Invalid disabled shipping readiness'; end if;
end $$;
reset role;
update private.shipping_feature_settings set enabled=true where singleton=true;
set local role authenticated;
do $$ declare result jsonb; begin
 result:=public.checkout_shipping_readiness();
 if result->'enabled' <> 'true'::jsonb or jsonb_typeof(result->'ready') <> 'boolean' then raise exception 'Invalid enabled shipping readiness'; end if;
end $$;
reset role;
rollback;
