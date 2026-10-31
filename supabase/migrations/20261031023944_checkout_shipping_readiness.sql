-- Expose only checkout readiness, never origin details or credentials.
create function public.checkout_shipping_readiness() returns jsonb
language plpgsql security definer set search_path='' as $$
declare enabled boolean;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select s.enabled into enabled from private.shipping_feature_settings s where s.singleton=true;
 if enabled is null then raise exception 'Shipping status unavailable' using errcode='55000'; end if;
 return jsonb_build_object('enabled',enabled,'ready',case when enabled then private.shipping_feature_ready() else false end);
end $$;
revoke all on function public.checkout_shipping_readiness() from public,anon;
grant execute on function public.checkout_shipping_readiness() to authenticated;
