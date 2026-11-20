begin;
insert into public.order_items(order_id,position,product_snapshot,creations_snapshot,quantity,normal_unit_price,unit_price,line_total)
values(:'order_id'::uuid,1,'{"id":"10ml","label":"10 ML","volume_ml":10,"bottle_count":1}','[]',1,100000,100000,100000);
select pg_sleep(2);
commit;
