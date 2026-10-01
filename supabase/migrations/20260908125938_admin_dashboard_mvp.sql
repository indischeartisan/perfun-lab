alter table public.notes add column version bigint not null default 1;
alter table public.products add column version bigint not null default 1;
alter table public.note_phases add column enabled boolean not null default true;
create index orders_admin_created_idx on public.orders(created_at desc,id);

create function private.require_admin() returns void language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role='admin') then
  raise exception 'Admin access required' using errcode='42501';
 end if;
end $$;
revoke all on function private.require_admin() from public,anon,authenticated;

create function private.admin_overview() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; today_start timestamptz:=(date_trunc('day',now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta');
begin
 perform private.require_admin();
 select jsonb_build_object('orders_today',count(*) filter(where created_at>=today_start and created_at<today_start+interval '1 day'),
  'pending_payment',count(*) filter(where status='pending_payment'),'paid_orders',count(*) filter(where payment_status='paid'),
  'paid_gross_sales',coalesce(sum(subtotal) filter(where payment_status='paid'),0),
  'discounts',coalesce(sum(discount) filter(where payment_status='paid'),0),
  'shipping_collected',coalesce(sum(shipping) filter(where payment_status='paid'),0),
  'net_transaction_total',coalesce(sum(grand_total) filter(where payment_status='paid'),0)) into result from public.orders;
 return result || jsonb_build_object('timezone','Asia/Jakarta','as_of',now(),
  'production_queued',(select count(*) from public.production_jobs where status='queued'),
  'production_in_progress',(select count(*) from public.production_jobs where status='in_production'),
  'ready_to_ship',(select count(*) from public.shipments where status='ready_to_ship'),
  'shipped',(select count(*) from public.shipments where status='shipped'),
  'delivered',(select count(*) from public.shipments where status='delivered'));
end $$;

create function private.admin_orders(p_search text,p_payment text,p_production text,p_shipment text,p_page integer) returns jsonb
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
  cross join lateral (select count(*) item_count,coalesce(jsonb_agg(jsonb_build_object('label',i.product_snapshot->>'label',
   'volume_ml',i.product_snapshot->'volume_ml','bottle_count',i.product_snapshot->'bottle_count','quantity',i.quantity) order by i.position),'[]'::jsonb) products
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

create function private.admin_customers(p_search text,p_page integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform private.require_admin();
 if p_page is null or p_page not between 0 and 100000 or length(coalesce(p_search,''))>100 then raise exception 'Invalid search/page' using errcode='22023'; end if;
 with customers as (
  select p.id,p.full_name as name,p.email,count(o.id) total_orders,max(o.created_at) last_order
  from public.profiles p left join public.orders o on o.user_id=p.id where p.role='customer'
   and (coalesce(btrim(p_search),'')='' or strpos(lower(coalesce(p.full_name,'')||' '||coalesce(p.email,'')),lower(btrim(p_search)))>0)
  group by p.id,p.full_name,p.email
 ), page as (select * from customers order by last_order desc nulls last,id limit 25 offset p_page*25)
 select jsonb_build_object('count',(select count(*) from customers),'rows',coalesce((select jsonb_agg(to_jsonb(page) order by last_order desc nulls last,id) from page),'[]'::jsonb)) into result;
 return result;
end $$;

create function private.admin_catalog() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.require_admin();
 return jsonb_build_object('notes',(select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'name',n.name,'active',n.active,
  'category',n.category,'descriptor',n.short_description,'sticker_asset',n.sticker_asset,'version',n.version,
  'phases',(select coalesce(jsonb_agg(jsonb_build_object('phase',np.phase,'enabled',np.enabled,'sort_order',np.sort_order,'prediction_text',np.prediction_text) order by np.phase),'[]'::jsonb) from public.note_phases np where np.note_id=n.id)) order by n.name),'[]'::jsonb) from public.notes n),
  'products',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'label',p.label,'active',p.active,'version',p.version,
   'regular_price',(select amount from public.product_prices where product_id=p.id and kind='normal'),
   'sale_price',(select amount from public.product_prices where product_id=p.id and kind='launch')) order by p.sort_order),'[]'::jsonb) from public.products p));
end $$;

create function private.admin_save_note(p_id text,p_version bigint,p_active boolean,p_category text,p_descriptor text,p_phases jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare note public.notes; phase_row jsonb;
begin
 perform private.require_admin();
 select * into note from public.notes where id=p_id for update;
 if not found then raise exception 'Note not found' using errcode='P0002'; end if;
 if p_version is distinct from note.version then raise exception 'Note changed. Reload before saving.' using errcode='40001'; end if;
 if p_active is null or length(btrim(coalesce(p_category,''))) not between 1 and 100 or length(btrim(coalesce(p_descriptor,''))) not between 1 and 500 then raise exception 'Category and descriptor are required' using errcode='23514'; end if;
 if jsonb_typeof(p_phases) is distinct from 'array' or jsonb_array_length(p_phases)<>3 then raise exception 'Provide all three phase settings' using errcode='23514'; end if;
 if (select count(distinct value->>'phase') from jsonb_array_elements(p_phases) where value->>'phase' in ('top','middle','base'))<>3 then raise exception 'Invalid phases' using errcode='23514'; end if;
 for phase_row in select value from jsonb_array_elements(p_phases) loop
  if jsonb_typeof(phase_row->'enabled') is distinct from 'boolean' or coalesce(phase_row->>'sort_order','') !~ '^[0-9]{1,4}$'
   or length(coalesce(phase_row->>'prediction_text',''))>500 then raise exception 'Invalid phase settings' using errcode='23514'; end if;
  if p_id='soapy' and not (phase_row->>'enabled')::boolean then raise exception 'Soapy must allow top, mid and base phases' using errcode='23514'; end if;
 end loop;
 if p_active and not exists(select 1 from jsonb_array_elements(p_phases) where (value->>'enabled')::boolean) then raise exception 'An active note needs an allowed phase' using errcode='23514'; end if;
 update public.notes set active=p_active,category=btrim(p_category),short_description=btrim(p_descriptor),version=version+1 where id=p_id;
 -- Retain disabled phase rows so saved Creation foreign keys stay valid.
 insert into public.note_phases(note_id,phase,enabled,sort_order,prediction_text)
  select p_id,value->>'phase',(value->>'enabled')::boolean,(value->>'sort_order')::integer,coalesce(value->>'prediction_text','') from jsonb_array_elements(p_phases)
  on conflict(note_id,phase) do update set enabled=excluded.enabled,sort_order=excluded.sort_order,prediction_text=excluded.prediction_text;
end $$;

create function private.admin_save_product(p_id text,p_version bigint,p_active boolean,p_regular_price integer,p_sale_price integer)
returns void language plpgsql security definer set search_path='' as $$
declare product public.products;
begin
 perform private.require_admin();
 select * into product from public.products where id=p_id for update;
 if not found then raise exception 'Product not found' using errcode='P0002'; end if;
 if p_version is distinct from product.version then raise exception 'Product changed. Reload before saving.' using errcode='40001'; end if;
 if p_active is null or p_regular_price is null or p_regular_price<=0 or (p_sale_price is not null and (p_sale_price<=0 or p_sale_price>p_regular_price)) then raise exception 'Prices must be positive whole rupiah; sale cannot exceed regular price' using errcode='23514'; end if;
 update public.products set active=p_active,version=version+1 where id=p_id;
 insert into public.product_prices(product_id,kind,amount) values(p_id,'normal',p_regular_price)
  on conflict(product_id,kind) do update set amount=excluded.amount;
 if p_sale_price is null then delete from public.product_prices where product_id=p_id and kind='launch';
 else insert into public.product_prices(product_id,kind,amount) values(p_id,'launch',p_sale_price) on conflict(product_id,kind) do update set amount=excluded.amount;
 end if;
end $$;

-- Public wrappers remain invokers. Each private implementation rechecks the current DB role.
create function public.admin_overview() returns jsonb language sql security invoker set search_path='' as $$ select private.admin_overview(); $$;
create function public.admin_orders(p_search text default '',p_payment text default null,p_production text default null,p_shipment text default null,p_page integer default 0)
returns jsonb language sql security invoker set search_path='' as $$ select private.admin_orders(p_search,p_payment,p_production,p_shipment,p_page); $$;
create function public.admin_customers(p_search text default '',p_page integer default 0) returns jsonb language sql security invoker set search_path='' as $$ select private.admin_customers(p_search,p_page); $$;
create function public.admin_catalog() returns jsonb language sql security invoker set search_path='' as $$ select private.admin_catalog(); $$;
create function public.admin_save_note(p_id text,p_version bigint,p_active boolean,p_category text,p_descriptor text,p_phases jsonb)
returns void language sql security invoker set search_path='' as $$ select private.admin_save_note(p_id,p_version,p_active,p_category,p_descriptor,p_phases); $$;
create function public.admin_save_product(p_id text,p_version bigint,p_active boolean,p_regular_price integer,p_sale_price integer default null)
returns void language sql security invoker set search_path='' as $$ select private.admin_save_product(p_id,p_version,p_active,p_regular_price,p_sale_price); $$;
do $$ declare signature text; target_schema text; begin
 foreach signature in array array['admin_overview()','admin_orders(text,text,text,text,integer)','admin_customers(text,integer)','admin_catalog()',
  'admin_save_note(text,bigint,boolean,text,text,jsonb)','admin_save_product(text,bigint,boolean,integer,integer)'] loop
  foreach target_schema in array array['public','private'] loop
   execute 'revoke all on function '||target_schema||'.'||signature||' from public,anon,authenticated';
   execute 'grant execute on function '||target_schema||'.'||signature||' to authenticated';
  end loop;
 end loop;
end $$;

-- Reject newly selected disabled phases; existing saved formulas and order snapshots remain readable.
create function private.validate_selected_note_phase() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and row(new.creation_id,new.note_id,new.phase) is not distinct from row(old.creation_id,old.note_id,old.phase) then return new; end if;
 perform 1 from public.notes where id=new.note_id and active for share;
 if not found then raise exception 'Note is inactive' using errcode='23514'; end if;
 perform 1 from public.note_phases where note_id=new.note_id and phase=new.phase and enabled for share;
 if not found then raise exception 'Note is not allowed in this phase' using errcode='23514'; end if;
 return new;
end $$;
revoke all on function private.validate_selected_note_phase() from public,anon,authenticated;
create trigger validate_selected_note_phase before insert or update of creation_id,note_id,phase on public.creation_notes
 for each row execute function private.validate_selected_note_phase();
-- Checkout uses privileged reads, so explicitly reject disabled phase choices there too.
do $$ declare definition text; original text := 'or exists(select 1 from public.creation_notes cn join public.notes n on n.id=cn.note_id where cn.creation_id=selected_creation_id and not n.active)'; begin
 definition:=pg_get_functiondef('private.checkout(uuid,jsonb,uuid,text,boolean)'::regprocedure);
 if position(original in definition)=0 then raise exception 'Unexpected checkout implementation'; end if;
 execute replace(definition,original,'or exists(select 1 from public.creation_notes cn join public.notes n on n.id=cn.note_id join public.note_phases np on np.note_id=cn.note_id and np.phase=cn.phase where cn.creation_id=selected_creation_id and (not n.active or not np.enabled))');
end $$;
