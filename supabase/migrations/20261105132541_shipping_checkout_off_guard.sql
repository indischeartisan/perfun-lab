-- Checkout is intentionally unavailable while shipping quotes are disabled.
-- Keep address management and shipping-destinations independent from this gate.
create or replace function private.require_shipping_checkout_enabled()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  if not coalesce((
    select enabled
    from private.shipping_feature_settings
    where singleton = true
  ), false) then
    raise exception 'Shipping checkout is not enabled. No order was created.'
      using errcode = '23514';
  end if;
end;
$$;

revoke all on function private.require_shipping_checkout_enabled() from public, anon;
grant execute on function private.require_shipping_checkout_enabled() to authenticated;

create or replace function public.quote_order(
  p_address_id uuid,
  p_items jsonb,
  p_shipping_quote_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.require_shipping_checkout_enabled();
  return private.checkout(p_address_id, p_items, p_shipping_quote_id, null, null, false);
end;
$$;

create or replace function public.place_order(
  p_address_id uuid,
  p_items jsonb,
  p_shipping_quote_id uuid,
  p_request_id uuid,
  p_quote_token text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.require_shipping_checkout_enabled();
  return private.checkout(p_address_id, p_items, p_shipping_quote_id, p_request_id, p_quote_token, true);
end;
$$;

revoke all on function public.quote_order(uuid, jsonb, uuid) from public, anon;
revoke all on function public.place_order(uuid, jsonb, uuid, uuid, text) from public, anon;
grant execute on function public.quote_order(uuid, jsonb, uuid) to authenticated;
grant execute on function public.place_order(uuid, jsonb, uuid, uuid, text) to authenticated;
