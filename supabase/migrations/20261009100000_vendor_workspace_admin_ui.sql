-- Phase 2B admin read model. Browser roles keep no direct assignment-table access.
create or replace function private.admin_vendor_workspace(p_page integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.require_admin();
 if p_page is null or p_page not between 0 and 100000 then raise exception 'Invalid page' using errcode='22023'; end if;
 return jsonb_build_object(
  'default_vendor_id',(select default_vendor_id from private.vendor_assignment_settings where singleton=true),
  'vendors',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name,'email',p.email) order by coalesce(p.full_name,p.email),p.id),'[]'::jsonb) from public.profiles p where p.role='vendor'),
  'unassigned_count',(select count(*) from public.orders o left join public.order_vendor_assignments a on a.order_id=o.id where o.payment_status='paid' and a.order_id is null),
  'unassigned_orders',(select coalesce(jsonb_agg(to_jsonb(page) order by page.created_at desc,page.id),'[]'::jsonb) from (
    select o.id,o.order_number,o.created_at,o.status,o.grand_total,coalesce(jsonb_agg(jsonb_build_object('label',i.product_snapshot->>'label','volume_ml',i.product_snapshot->>'volume_ml','bottle_count',i.product_snapshot->>'bottle_count','quantity',i.quantity) order by i.position),'[]'::jsonb) products
    from public.orders o join public.order_items i on i.order_id=o.id left join public.order_vendor_assignments a on a.order_id=o.id
    where o.payment_status='paid' and a.order_id is null group by o.id order by o.created_at desc,o.id limit 25 offset p_page*25
  ) page)
 );
end $$;
revoke all on function private.admin_vendor_workspace(integer) from public,anon,authenticated;
create or replace function public.admin_vendor_workspace(p_page integer default 0)
returns jsonb language sql security definer set search_path='' as $$ select private.admin_vendor_workspace(p_page); $$;
revoke all on function public.admin_vendor_workspace(integer) from public,anon;
grant execute on function public.admin_vendor_workspace(integer) to authenticated;
