-- Project only the immutable order recipe snapshot into the existing admin list RPC.
-- This keeps the RPC signature, admin guard, pagination, and existing fields intact.
create or replace function private.admin_orders(p_search text,p_payment text,p_production text,p_shipment text,p_page integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform private.require_admin();
 if p_page is null or p_page not between 0 and 100000 or length(coalesce(p_search,''))>100 then raise exception 'Invalid search/page' using errcode='22023'; end if;
 if p_payment is not null and p_payment not in ('pending','paid','failed','expired','refunded') then raise exception 'Invalid payment filter' using errcode='22023'; end if;
 if p_production is not null and p_production not in ('not_started','queued','in_production','completed') then raise exception 'Invalid production filter' using errcode='22023'; end if;
 if p_shipment is not null and p_shipment not in ('not_created','pending','ready_to_ship','shipped','delivered') then raise exception 'Invalid shipment filter' using errcode='22023'; end if;
 with rows as (
  select o.id,o.order_number,o.created_at,o.status,o.grand_total,o.payment_status,
   jsonb_build_object('name',p.full_name,'email',p.email) customer,
   coalesce(s.status,'not_created') shipment_status,
   x.products,x.item_count,j.total as job_count,j.queued,j.in_progress,j.completed,
   case when j.total=0 then 'not_started' when j.completed=x.item_count and x.item_count>0 then 'completed'
    when j.in_progress>0 or j.completed>0 then 'in_production' else 'queued' end production_status
  from public.orders o join public.profiles p on p.id=o.user_id left join public.shipments s on s.order_id=o.id
  cross join lateral (select count(*) item_count,coalesce(jsonb_agg(jsonb_build_object(
   'label',i.product_snapshot->>'label',
   'volume_ml',i.product_snapshot->'volume_ml',
   'bottle_count',i.product_snapshot->'bottle_count',
   'quantity',i.quantity,
   'blends',coalesce((select jsonb_agg(jsonb_build_object(
     'label',nullif(blend.value->>'name',''),
     'notes',coalesce((select jsonb_agg(jsonb_build_object(
       'phase',note.value->>'phase',
       'id',note.value->'note'->>'id',
       'name',note.value->'note'->>'name'
      ) order by case note.value->>'phase' when 'top' then 1 when 'middle' then 2 when 'base' then 3 else 4 end)
      from jsonb_array_elements(case when jsonb_typeof(blend.value->'notes')='array' then blend.value->'notes' else '[]'::jsonb end) note), '[]'::jsonb)
    ) order by blend.ordinality)
    from jsonb_array_elements(case when jsonb_typeof(i.creations_snapshot)='array' then i.creations_snapshot else '[]'::jsonb end) with ordinality blend(value,ordinality)), '[]'::jsonb)
   ) order by i.position),'[]'::jsonb) products
   from public.order_items i where i.order_id=o.id) x
  cross join lateral (select count(*) total,count(*) filter(where j.status='queued') queued,
   count(*) filter(where j.status='in_production') in_progress,count(*) filter(where j.status='completed') completed
   from public.production_jobs j join public.order_items i on i.id=j.order_item_id where i.order_id=o.id) j
  where (p_payment is null or o.payment_status=p_payment)
   and (coalesce(btrim(p_search),'')='' or strpos(lower(o.order_number||' '||coalesce(p.full_name,'')||' '||coalesce(p.email,'')),lower(btrim(p_search)))>0)
 ), filtered as (select * from rows where (p_production is null or production_status=p_production) and (p_shipment is null or shipment_status=p_shipment)),
 page as (select * from filtered order by created_at desc,id limit 25 offset p_page*25)
 select jsonb_build_object('count',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc,id) from page),'[]'::jsonb)) into result;
 return result;
end $$;

-- Keep the existing public wrapper and its grants; private.admin_orders retains the admin guard.
