-- Vendor-only order pagination. SECURITY INVOKER retains production_jobs RLS.
-- One SELECT statement supplies both the page and every visible job in each order.
create index production_jobs_vendor_order_stage_idx
 on public.production_jobs(vendor_id, status, ordered_at, order_number)
 where vendor_id is not null;
create index production_jobs_vendor_order_items_idx
 on public.production_jobs(vendor_id, order_number, created_at, id)
 where vendor_id is not null;

create function public.list_vendor_production_orders(
 p_status text,
 p_after_ordered_at timestamptz default null,
 p_after_order_number text default null
) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not exists (
  select 1 from public.profiles p where p.id=auth.uid() and p.role='vendor'
 ) then raise exception 'Vendor access required' using errcode='42501'; end if;
 if p_status is null or p_status not in ('queued','in_production','completed') then
  raise exception 'Invalid production stage' using errcode='22023';
 end if;
 if (p_after_ordered_at is null) <> (p_after_order_number is null)
    or (p_after_order_number is not null and (length(p_after_order_number)=0 or length(p_after_order_number)>200)) then
  raise exception 'Invalid order cursor' using errcode='22023';
 end if;
 with eligible as materialized (
  select distinct j.ordered_at,j.order_number
  from public.production_jobs j
  where j.vendor_id=auth.uid() and j.status=p_status
   and (p_after_ordered_at is null or (j.ordered_at,j.order_number)>(p_after_ordered_at,p_after_order_number))
  order by j.ordered_at,j.order_number limit 26
 ), page as materialized (
  select ordered_at,order_number from eligible order by ordered_at,order_number limit 25
 ), expanded as (
  select p.ordered_at,p.order_number,
   (select coalesce(jsonb_agg(jsonb_build_object(
    'id',j.id,'order_item_id',j.order_item_id,'status',j.status,'assigned_to',j.assigned_to,
    'started_at',j.started_at,'completed_at',j.completed_at,'created_at',j.created_at,'updated_at',j.updated_at,
    'order_number',j.order_number,'ordered_at',j.ordered_at,'quantity',j.quantity,
    'production_allowed',j.production_allowed,'product_snapshot',j.product_snapshot,'formulas_snapshot',j.formulas_snapshot
   ) order by j.created_at,j.id),'[]'::jsonb)
    from public.production_jobs j where j.vendor_id=auth.uid() and j.order_number=p.order_number) jobs
  from page p
 )
 select jsonb_build_object(
  'rows',coalesce((select jsonb_agg(to_jsonb(e) order by e.ordered_at,e.order_number) from expanded e),'[]'::jsonb),
  'has_more',(select count(*)>25 from eligible),
  'next_cursor',(select jsonb_build_object('ordered_at',p.ordered_at,'order_number',p.order_number)
    from page p order by p.ordered_at desc,p.order_number desc limit 1)
 ) into result;
 return result;
end $$;

revoke all on function public.list_vendor_production_orders(text,timestamptz,text) from public,anon;
grant execute on function public.list_vendor_production_orders(text,timestamptz,text) to authenticated;
