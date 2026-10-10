begin;
insert into auth.users(id,email) values ('f5100000-0000-4000-8000-000000000001','shipping-checkout@example.invalid'),('f5100000-0000-4000-8000-000000000002','shipping-checkout-other@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub','f5100000-0000-4000-8000-000000000001',true);
select public.save_address('f5200000-0000-4000-8000-000000000001','{"recipient_name":"Checkout","phone":"0812","address_line":"Street","city":"Tangerang","province":"Banten","postal_code":"15720","label":"Home"}');
reset role;
update private.shipping_feature_settings set enabled=true;
update private.shipping_origin_settings set status='active',origin_destination_id=991,origin_destination_label='{"name":"Origin"}',version=2,verified_at=clock_timestamp(),verified_by='f5100000-0000-4000-8000-000000000001',updated_by='f5100000-0000-4000-8000-000000000001';
select public.bind_address_shipping_destination('f5100000-0000-4000-8000-000000000001','f5200000-0000-4000-8000-000000000001',992,'{"name":"Destination"}');
set local role service_role;
do $$ declare q jsonb; items jsonb:='[{"product_id":"10ml","quantity":1,"formulas":[{"top":"yuzu","middle":"matcha","base":"vanilla"}]}]'; begin
 q:=public.create_shipping_quote('f5100000-0000-4000-8000-000000000001','f5200000-0000-4000-8000-000000000001',items,'jne','JNE','REG',18000,'2 days'); perform set_config('app.shipping_checkout_quote',q->>'quote_id',false); perform set_config('app.shipping_checkout_items',items::text,false);
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','f5100000-0000-4000-8000-000000000001',true);
do $$ declare items jsonb:=current_setting('app.shipping_checkout_items')::jsonb; qid uuid:=current_setting('app.shipping_checkout_quote')::uuid; reviewed jsonb; oid uuid; retry uuid; payment jsonb; begin
 reviewed:=public.quote_order('f5200000-0000-4000-8000-000000000001',items,qid);
 if (reviewed->>'shipping')::bigint<>18000 or (reviewed->>'grand_total')::bigint<>127000 then raise exception 'Shipping total was not server calculated: %',reviewed; end if;
 oid:=(public.place_order('f5200000-0000-4000-8000-000000000001',items,qid,'f5300000-0000-4000-8000-000000000001',reviewed->>'quote_token')->>'order_id')::uuid;
 retry:=(public.place_order('f5200000-0000-4000-8000-000000000001',items,qid,'f5300000-0000-4000-8000-000000000001',reviewed->>'quote_token')->>'order_id')::uuid;
 if oid<>retry or (select shipping from public.orders where id=oid)<>18000 or (select shipping_quote_snapshot->>'service' from public.orders where id=oid)<>'REG' then raise exception 'Shipping order/idempotency snapshot failed'; end if;
 perform set_config('app.shipping_checkout_order',oid::text,false);
 begin perform public.quote_order('f5200000-0000-4000-8000-000000000001','[{"product_id":"30ml","quantity":1,"formulas":[{"top":"soapy","middle":"peony","base":"amber"}]}]',qid); raise exception 'Item mismatch accepted'; exception when check_violation then null; end;
end $$;
reset role;
set local role service_role;
do $$ declare payment jsonb; begin
 payment:=public.reserve_payment(current_setting('app.shipping_checkout_order')::uuid,'f5100000-0000-4000-8000-000000000001','doku','sandbox','https://example.invalid');
 if (payment->>'amount')::bigint<>(select grand_total from public.orders where id=current_setting('app.shipping_checkout_order')::uuid) then raise exception 'DOKU amount did not use final total'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','f5100000-0000-4000-8000-000000000002',true);
do $$ begin
 begin perform public.get_shipping_quote(current_setting('app.shipping_checkout_quote')::uuid); raise exception 'Foreign quote exposed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
insert into auth.users(id,email) values ('f5100000-0000-4000-8000-000000000003','shipping-vendor@example.invalid'),('f5100000-0000-4000-8000-000000000004','shipping-admin@example.invalid');
update public.profiles set role='vendor' where id='f5100000-0000-4000-8000-000000000003';
update public.profiles set role='admin' where id='f5100000-0000-4000-8000-000000000004';
set local role service_role;
do $$ declare payment_id uuid; begin
 select id into payment_id from public.payments where order_id=current_setting('app.shipping_checkout_order')::uuid;
 perform public.apply_payment_event(payment_id,'fulfillment-paid',127000,'paid',clock_timestamp(),'{}');
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','f5100000-0000-4000-8000-000000000004',true);
select public.admin_assign_vendor(current_setting('app.shipping_checkout_order')::uuid,'f5100000-0000-4000-8000-000000000003');
reset role;
set local role service_role;
do $$ declare job_ids text; begin
 select string_agg(j.id::text,',') into job_ids from public.production_jobs j join public.order_items i on i.id=j.order_item_id where i.order_id=current_setting('app.shipping_checkout_order')::uuid;
 if job_ids is null then raise exception 'Paid checkout order did not create production jobs'; end if;
 if exists(select 1 from public.production_jobs j join public.order_items i on i.id=j.order_item_id where i.order_id=current_setting('app.shipping_checkout_order')::uuid and j.vendor_id is distinct from 'f5100000-0000-4000-8000-000000000003'::uuid) then raise exception 'Vendor assignment did not project to production jobs'; end if;
 perform set_config('app.shipping_checkout_jobs',job_ids,false);
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','f5100000-0000-4000-8000-000000000003',true);
do $$ declare job_id uuid; shipment_id uuid; snapshot jsonb; checklist jsonb:='{"bottles_checked":true,"formula_stickers_checked":true,"bottles_sealed":true,"packaging_ready":true,"recipient_label_checked":true}'; begin
 for job_id in select job_id_text::uuid from unnest(string_to_array(current_setting('app.shipping_checkout_jobs'),',')) as job_id_text loop
  perform public.advance_production_job(job_id,'start'); perform public.advance_production_job(job_id,'complete');
 end loop;
 select id into shipment_id from public.shipments where order_id=current_setting('app.shipping_checkout_order')::uuid;
 if (select status from public.shipments where id=shipment_id)<>'ready_to_ship' then raise exception 'Completed production did not make shipment ready'; end if;
 if (select courier from public.shipments where id=shipment_id)<>'JNE' or (select service from public.shipments where id=shipment_id)<>'REG' then raise exception 'Shipment did not inherit customer service'; end if;
 perform public.save_shipment_packing(shipment_id,checklist,true); perform public.save_actual_shipping(shipment_id,22000,'vendor');
 begin perform public.fulfill_shipment(shipment_id,'save','SiCepat','BEST',''); raise exception 'Vendor changed customer service'; exception when check_violation then null; end;
 begin perform public.admin_override_shipment_service(shipment_id,'SiCepat','BEST','Attempted vendor override'); raise exception 'Vendor override allowed'; exception when insufficient_privilege then null; end;
 snapshot:=public.list_fulfillment_shipments('ready_to_ship',0);
 if snapshot->'rows'->0->'customer_shipping'->>'courier'<>'JNE' then raise exception 'Vendor cannot see customer service'; end if;
end $$;
select set_config('request.jwt.claim.sub','f5100000-0000-4000-8000-000000000004',true);
do $$ declare shipment_id uuid; before_total bigint; before_cost bigint; begin
 select id into shipment_id from public.shipments where order_id=current_setting('app.shipping_checkout_order')::uuid;
 select grand_total into before_total from public.orders where id=current_setting('app.shipping_checkout_order')::uuid;
 select actual_shipping_cost into before_cost from public.shipments where id=shipment_id;
 begin perform public.admin_override_shipment_service(shipment_id,'J&T','EZ',''); raise exception 'Override without reason allowed'; exception when check_violation then null; end;
 perform public.admin_override_shipment_service(shipment_id,'J&T','EZ','Carrier service outage');
 if (select grand_total from public.orders where id=current_setting('app.shipping_checkout_order')::uuid)<>before_total or (select shipping from public.orders where id=current_setting('app.shipping_checkout_order')::uuid)<>18000 then raise exception 'Override changed customer total'; end if;
 if (select actual_shipping_cost from public.shipments where id=shipment_id)<>before_cost or (select shipping_payer from public.shipments where id=shipment_id)<>'vendor' then raise exception 'Override changed actual shipping'; end if;
 if not exists(select 1 from private.shipment_shipping_service_overrides where shipment_id=shipment_id and reason='Carrier service outage') then raise exception 'Override audit missing'; end if;
end $$;
select set_config('request.jwt.claim.sub','f5100000-0000-4000-8000-000000000003',true);
do $$ declare shipment_id uuid; begin
 select id into shipment_id from public.shipments where order_id=current_setting('app.shipping_checkout_order')::uuid;
 perform public.fulfill_shipment(shipment_id,'ship','J&T','EZ','TRACK-5D');
end $$;
select set_config('request.jwt.claim.sub','f5100000-0000-4000-8000-000000000004',true);
do $$ declare shipment_id uuid; begin
 select id into shipment_id from public.shipments where order_id=current_setting('app.shipping_checkout_order')::uuid;
 begin perform public.admin_override_shipment_service(shipment_id,'JNE','REG','Too late'); raise exception 'Shipped override allowed'; exception when check_violation then null; end;
end $$;
reset role;
select 'PASS: checkout locks owned quote, preserves DOKU amount and idempotency, and fulfillment locks customer service with audited admin overrides' as result;
rollback;
