-- Finance read-model regression: WIB boundaries, repeat customers, payment retries,
-- paid-on-a-different-day orders, and vendor balance/draft/paid separation.
begin;
insert into auth.users(id,email) values
 ('af100000-0000-4000-8000-000000000001','finance-admin@example.invalid'),
 ('af100000-0000-4000-8000-000000000002','finance-customer-a@example.invalid'),
 ('af100000-0000-4000-8000-000000000003','finance-customer-b@example.invalid'),
 ('af100000-0000-4000-8000-000000000004','finance-vendor@example.invalid');
update public.profiles set role='admin' where id='af100000-0000-4000-8000-000000000001';
update public.profiles set role='vendor' where id='af100000-0000-4000-8000-000000000004';
insert into public.orders(id,order_number,user_id,request_id,request_payload,address_snapshot,subtotal,discount,shipping,grand_total,payment_status,status,created_at) values
 ('af200000-0000-4000-8000-000000000001','FIN-BOUNDARY','af100000-0000-4000-8000-000000000002',gen_random_uuid(),'{}','{}',100000,10000,15000,105000,'paid','paid','2026-01-01 16:59:59+00'),
 ('af200000-0000-4000-8000-000000000002','FIN-SAME-DAY','af100000-0000-4000-8000-000000000002',gen_random_uuid(),'{}','{}',200000,0,20000,220000,'paid','paid','2026-01-02 02:00:00+00'),
 ('af200000-0000-4000-8000-000000000003','FIN-UNPAID','af100000-0000-4000-8000-000000000003',gen_random_uuid(),'{}','{}',50000,0,10000,60000,'pending','pending_payment','2026-01-02 03:00:00+00'),
 ('af200000-0000-4000-8000-000000000004','FIN-REFUNDED','af100000-0000-4000-8000-000000000003',gen_random_uuid(),'{}','{}',50000,0,10000,60000,'refunded','paid','2026-01-02 04:00:00+00');
insert into public.order_items(id,order_id,position,product_snapshot,creations_snapshot,quantity,normal_unit_price,unit_price,line_total) values
 ('af300000-0000-4000-8000-000000000001','af200000-0000-4000-8000-000000000001',1,'{"id":"10ml","label":"10 ML","volume_ml":10,"bottle_count":1}','[]',1,100000,90000,90000),
 ('af300000-0000-4000-8000-000000000002','af200000-0000-4000-8000-000000000002',1,'{"id":"10ml","label":"10 ML","volume_ml":10,"bottle_count":1}','[]',2,100000,100000,200000),
 ('af300000-0000-4000-8000-000000000003','af200000-0000-4000-8000-000000000003',1,'{"id":"10ml","label":"10 ML","volume_ml":10,"bottle_count":1}','[]',1,50000,50000,50000),
 ('af300000-0000-4000-8000-000000000004','af200000-0000-4000-8000-000000000004',1,'{"id":"10ml","label":"10 ML","volume_ml":10,"bottle_count":1}','[]',1,50000,50000,50000);
insert into public.payments(id,order_id,provider,environment,provider_reference,amount,status,paid_at,request_payload,created_at) values
 ('af400000-0000-4000-8000-000000000001','af200000-0000-4000-8000-000000000001','test','sandbox','FIN-TRY-1',105000,'paid','2026-01-02 16:59:59+00','{}','2026-01-01 17:00:00+00'),
 ('af400000-0000-4000-8000-000000000002','af200000-0000-4000-8000-000000000001','test','sandbox','FIN-TRY-2',105000,'paid','2026-01-02 17:00:01+00','{}','2026-01-02 16:00:00+00'),
 ('af400000-0000-4000-8000-000000000003','af200000-0000-4000-8000-000000000002','test','sandbox','FIN-SUCCESS-2',220000,'paid','2026-01-03 01:00:00+00','{}','2026-01-02 02:00:00+00');
insert into public.order_vendor_assignments(order_id,vendor_id,assigned_by,assignment_source,vendor_fee_amount,vendor_fee_snapshot) values
 ('af200000-0000-4000-8000-000000000001','af100000-0000-4000-8000-000000000004','af100000-0000-4000-8000-000000000001','manual',50000,'{"total_fee":50000}'),
 ('af200000-0000-4000-8000-000000000002','af100000-0000-4000-8000-000000000004','af100000-0000-4000-8000-000000000001','manual',100000,'{"total_fee":100000}');
insert into public.shipments(id,order_id,status,courier,service,tracking_number,shipping_cost,shipped_at,order_number,ordered_at,address_snapshot,items_snapshot,fulfillment_allowed,provider,packing_status,actual_shipping_cost,shipping_payer,actual_shipping_entered_at,actual_shipping_entered_by,vendor_id) values
 ('af500000-0000-4000-8000-000000000001','af200000-0000-4000-8000-000000000001','shipped','T','R','FIN-1',12000,'2026-01-02 18:00:00+00','FIN-BOUNDARY','2026-01-01 16:59:59+00','{}','[]',true,'manual','packed',12000,'vendor','2026-01-02 17:00:00+00','af100000-0000-4000-8000-000000000004','af100000-0000-4000-8000-000000000004'),
 ('af500000-0000-4000-8000-000000000002','af200000-0000-4000-8000-000000000002','shipped','T','R','FIN-2',9000,'2026-01-03 18:00:00+00','FIN-SAME-DAY','2026-01-02 02:00:00+00','{}','[]',true,'manual','packed',9000,'perfun','2026-01-03 17:00:00+00','af100000-0000-4000-8000-000000000004','af100000-0000-4000-8000-000000000004');
insert into public.vendor_payouts(id,vendor_id,payout_date,status,total,transfer_reference,paid_at,paid_by,request_id) values
 ('af600000-0000-4000-8000-000000000001','af100000-0000-4000-8000-000000000004','2026-01-03','paid',62000,'FIN-BANK-1','2026-01-02 18:00:00+00','af100000-0000-4000-8000-000000000001',gen_random_uuid()),
 ('af600000-0000-4000-8000-000000000002','af100000-0000-4000-8000-000000000004','2026-01-03','draft',100000,null,null,null,gen_random_uuid());
insert into public.vendor_payout_items(payout_id,order_id,vendor_id,vendor_fee_amount,shipping_reimbursement,total_amount,status) values
 ('af600000-0000-4000-8000-000000000001','af200000-0000-4000-8000-000000000001','af100000-0000-4000-8000-000000000004',50000,12000,62000,'paid'),
 ('af600000-0000-4000-8000-000000000002','af200000-0000-4000-8000-000000000002','af100000-0000-4000-8000-000000000004',100000,0,100000,'reserved');
set local role authenticated;
select set_config('request.jwt.claim.sub','af100000-0000-4000-8000-000000000001',true);
do $$ declare all_data jsonb; day_data jsonb; begin
 all_data:=public.admin_finance('all',null);
 if (all_data->'orders'->>'unique_customers')::int<>2 then raise exception 'All-time unique customers were summed by day or duplicated'; end if;
 if (all_data->'payments'->>'customer_payments')::bigint<>325000 then raise exception 'Retry or historical payment was counted incorrectly'; end if;
 day_data:=public.admin_finance('custom','2026-01-02')->'orders';
 if (day_data->>'unique_customers')::int<>2 or (day_data->>'orders')::int<>3 or (day_data->>'unpaid_orders')::int<>1 or (day_data->>'refunded_orders')::int<>1 then raise exception 'WIB boundary or refunded status classification failed'; end if;
 if (public.admin_finance('custom','2026-01-02')->'vendor'->>'outstanding_total')::bigint<>0 then raise exception 'Paid vendor payout remained outstanding'; end if;
 if (public.admin_finance('custom','2026-01-02')->'vendor'->>'draft_total')::bigint<>100000 then raise exception 'Draft vendor balance was mixed with paid balance'; end if;
 if (public.admin_finance('custom','2026-01-02')->'vendor'->>'paid_total')::bigint<>62000 then raise exception 'Vendor paid_at period was not used'; end if;
end $$;
reset role;
rollback;
select 'PASS: finance WIB boundaries, unique customers, payment retry dedupe, refund classification, and vendor balance separation' result;
