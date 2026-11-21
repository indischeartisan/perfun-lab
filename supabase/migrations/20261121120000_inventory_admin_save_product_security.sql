-- The inventory overload is an authenticated Admin API. Keep the implementation
-- private and let the wrapper cross the private EXECUTE boundary safely.
create or replace function public.admin_save_product(
  p_id text,
  p_version bigint,
  p_active boolean,
  p_regular_price integer,
  p_sale_price integer,
  p_stock_on_hand bigint,
  p_stock_tracking_enabled boolean
)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  perform private.require_admin();
  perform private.admin_save_product_with_inventory(
    p_id,
    p_version,
    p_active,
    p_regular_price,
    p_sale_price,
    p_stock_on_hand,
    p_stock_tracking_enabled
  );
end
$$;

revoke all on function public.admin_save_product(text,bigint,boolean,integer,integer,bigint,boolean) from public,anon,authenticated;
grant execute on function public.admin_save_product(text,bigint,boolean,integer,integer,bigint,boolean) to authenticated;
revoke all on function private.admin_save_product_with_inventory(text,bigint,boolean,integer,integer,bigint,boolean) from public,anon,authenticated;
