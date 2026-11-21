do $$ begin
 if (select count(*) from public.order_items where order_id in ('e2000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000002'))<>1 then raise exception 'Two buyers both reserved the last bottle'; end if;
 if (select stock_reserved from public.products where id='10ml')<>1 then raise exception 'Concurrent reservation counter is incorrect'; end if;
 if (select count(*) from public.order_inventory_reservations where product_id='10ml' and status='reserved')<>1 then raise exception 'Concurrent reservation row is incorrect'; end if;
end $$;
select 'PASS: two buyers compete for the last 10 ML bottle and only one reservation commits' result;
