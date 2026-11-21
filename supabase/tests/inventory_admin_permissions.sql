-- Disposable regression test for the inventory Admin wrapper.
begin;
insert into auth.users(id,email) values
 ('c1000000-0000-4000-8000-000000000001','inventory-admin@example.invalid'),
 ('c1000000-0000-4000-8000-000000000002','inventory-buyer@example.invalid'),
 ('c1000000-0000-4000-8000-000000000003','inventory-vendor@example.invalid');
update public.profiles set role='admin' where id='c1000000-0000-4000-8000-000000000001';
update public.profiles set role='vendor' where id='c1000000-0000-4000-8000-000000000003';

create temp table inventory_catalog_before as
select p.id,p.version,p.active,
       (select amount from public.product_prices where product_id=p.id and kind='normal') regular_price,
       (select amount from public.product_prices where product_id=p.id and kind='launch') sale_price,
       p.stock_on_hand,p.stock_reserved,p.stock_sold,p.stock_tracking_enabled
from public.products p where p.id in ('10ml','30ml') order by p.id;
create temp table inventory_counts_before as
select
 (select count(*) from public.orders) orders_count,
 (select count(*) from public.order_inventory_reservations) reservations_count,
 (select count(*) from public.payments) payments_count;

set local role authenticated;
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);

do $$ declare v bigint; regular integer; sale integer; begin
 select version into v from public.products where id='10ml';
 select amount into regular from public.product_prices where product_id='10ml' and kind='normal';
 select amount into sale from public.product_prices where product_id='10ml' and kind='launch';
 begin
   perform public.admin_save_product('10ml',v,true,regular,sale,null,true);
   raise exception 'Admin enabled tracking before initial stock';
 exception when check_violation then null;
 end;
 perform public.admin_save_product('10ml',v,true,regular,sale,12,false);
 select version into v from public.products where id='10ml';
 perform public.admin_save_product('10ml',v,true,regular,sale,12,true);
end $$;

do $$ declare v bigint; regular integer; sale integer; begin
 select version into v from public.products where id='30ml';
 select amount into regular from public.product_prices where product_id='30ml' and kind='normal';
 select amount into sale from public.product_prices where product_id='30ml' and kind='launch';
 perform public.admin_save_product('30ml',v,true,regular,sale,6,false);
 select version into v from public.products where id='30ml';
 perform public.admin_save_product('30ml',v,true,regular,sale,6,true);
end $$;

do $$ declare uid uuid; begin
 foreach uid in array array['c1000000-0000-4000-8000-000000000002'::uuid,'c1000000-0000-4000-8000-000000000003'::uuid] loop
   perform set_config('request.jwt.claim.sub',uid::text,true);
   begin
     perform public.admin_save_product('10ml',1,true,1,null,12,true);
     raise exception 'Non-admin changed inventory';
   exception when insufficient_privilege then null;
   end;
 end loop;
end $$;

select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
do $$ declare v bigint; regular integer; sale integer; begin
 select version into v from public.products where id='10ml';
 select amount into regular from public.product_prices where product_id='10ml' and kind='normal';
 select amount into sale from public.product_prices where product_id='10ml' and kind='launch';
 perform public.admin_save_product('10ml',v,true,regular,sale);
 if (select stock_on_hand from public.products where id='10ml')<>12 or
    not (select stock_tracking_enabled from public.products where id='10ml') then
   raise exception 'Legacy 5-parameter save changed inventory state';
 end if;
end $$;

reset role;
do $$ begin
 if (select count(*) from public.products where id in ('10ml','30ml') and stock_tracking_enabled)<>2 then raise exception 'Admin stock tracking was not enabled'; end if;
 if exists(select 1 from inventory_catalog_before before_row join public.products after_row using(id)
   where after_row.id in ('10ml','30ml')
     and (select amount from public.product_prices where product_id=after_row.id and kind='normal') is distinct from before_row.regular_price) then
   raise exception 'Inventory save changed price';
 end if;
 if exists(select 1 from inventory_catalog_before before_row join public.products after_row using(id)
   where after_row.id in ('10ml','30ml')
     and (select amount from public.product_prices where product_id=after_row.id and kind='launch') is distinct from before_row.sale_price) then
   raise exception 'Inventory save changed sale price';
 end if;
 if (select count(*) from public.orders)<>(select orders_count from inventory_counts_before) or
    (select count(*) from public.order_inventory_reservations)<>(select reservations_count from inventory_counts_before) or
    (select count(*) from public.payments)<>(select payments_count from inventory_counts_before) then
   raise exception 'Inventory save changed order, reservation, or payment data';
 end if;
 if has_function_privilege('authenticated','private.admin_save_product_with_inventory(text,bigint,boolean,integer,integer,bigint,boolean)','execute') then
   raise exception 'Private inventory implementation is callable by authenticated';
 end if;
end $$;

rollback;
select 'PASS: Admin inventory wrapper, role isolation, legacy save, and data preservation' result;
