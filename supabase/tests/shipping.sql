begin;
\ir checkout_test_helpers.sql
insert into auth.users(id,email) values
 ('d1000000-0000-4000-8000-000000000001','shipping-customer@example.invalid'),
 ('d1000000-0000-4000-8000-000000000002','shipping-perfumer-a@example.invalid'),
 ('d1000000-0000-4000-8000-000000000003','shipping-perfumer-b@example.invalid'),
 ('d1000000-0000-4000-8000-000000000004','shipping-admin@example.invalid'),
 ('d1000000-0000-4000-8000-000000000005','shipping-vendor@example.invalid');
update public.profiles set role='perfumer' where id in ('d1000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000003');
update public.profiles set role='admin' where id='d1000000-0000-4000-8000-000000000004';
update public.profiles set role='vendor' where id='d1000000-0000-4000-8000-000000000005';
insert into public.orders(id,order_number,user_id,request_id,request_payload,address_snapshot,subtotal,discount,shipping,grand_total)
 values('d2000000-0000-4000-8000-000000000001','SHIPPING-TEST','d1000000-0000-4000-8000-000000000001',gen_random_uuid(),'{}','{"recipient_name":"PRIVATE CUSTOMER"}',727000,60000,0,667000);
insert into public.order_items(id,order_id,position,product_snapshot,creations_snapshot,quantity,normal_unit_price,unit_price,line_total)
 select ('d3000000-0000-4000-8000-00000000000'||n)::uuid,'d2000000-0000-4000-8000-000000000001',n,
 jsonb_build_object('id',case n when 1 then '10ml' when 2 then '30ml' else 'bundle-3x10ml' end,'label',case n when 1 then '10 ML' when 2 then '30 ML' else 'Bundle 3x10ml' end,'volume_ml',case n when 2 then 30 else 10 end,'bottle_count',case n when 3 then 3 else 1 end,'secret_extra','PRIVATE'),
 (select jsonb_agg(jsonb_build_object('id',gen_random_uuid(),'name','PRIVATE CREATION','notes',jsonb_build_array(
 jsonb_build_object('phase','top','note',jsonb_build_object('id','yuzu','name','Historical Yuzu '||b)),
 jsonb_build_object('phase','middle','note',jsonb_build_object('id','rose','name','Historical Rose')),
 jsonb_build_object('phase','base','note',jsonb_build_object('id','musk','name','Historical Musk'))))) from generate_series(1,case n when 3 then 3 else 1 end) b),
 case n when 1 then 2 else 1 end,129000,109000,109000*(case n when 1 then 2 else 1 end)
 from generate_series(1,3) n;
update public.profiles set role='customer' where id='d1000000-0000-4000-8000-000000000003';
update public.orders set address_snapshot='{"recipient_name":"Shipment Recipient","phone":"081234567890","address_line":"Historical Street 1","city":"Bandung","province":"Jawa Barat","postal_code":"40111","district":"Old District","delivery_note":"Front door","secret_extra":"PRIVATE"}' where id='d2000000-0000-4000-8000-000000000001';
insert into public.addresses(id,user_id,recipient_name,phone,address_line,city,province,postal_code,label) values
 ('d4000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','Shipment Recipient','081234567890','Historical Street 1','Bandung','Jawa Barat','40111','Home');
do $$ begin
 if exists(select 1 from public.shipments where order_number='SHIPPING-TEST') then raise exception 'Unpaid shipment created'; end if;
 begin insert into public.shipments(order_id) values('d2000000-0000-4000-8000-000000000001'); raise exception 'Unpaid insert allowed'; exception when check_violation then null; end;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000004',true);
select public.admin_set_default_vendor(null);
reset role;
set local role service_role;
do $$ declare p jsonb; before_state jsonb; begin
 p:=public.reserve_payment('d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','doku','sandbox','https://example.invalid');
 perform public.apply_payment_event((p->>'id')::uuid,'shipping-paid',667000,'paid',now(),'{}');
 select to_jsonb(s) into before_state from public.shipments s where order_id='d2000000-0000-4000-8000-000000000001';
 perform public.apply_payment_event((p->>'id')::uuid,'shipping-paid',667000,'paid',now(),'{}');
 if before_state is distinct from (select to_jsonb(s) from public.shipments s where order_id='d2000000-0000-4000-8000-000000000001') then raise exception 'Payment retry changed shipment'; end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000004',true);
select public.admin_assign_vendor('d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000005');
reset role;
do $$ declare s public.shipments; begin
 select * into s from public.shipments where order_number='SHIPPING-TEST';
 if s.id is null or s.status<>'pending' or s.shipping_cost<>0 then raise exception 'Pending initialization failed'; end if;
 if jsonb_array_length(s.items_snapshot)<>3 or s.items_snapshot->2->'product'->>'bottle_count'<>'3' or s.items_snapshot->0->>'quantity'<>'2' then raise exception 'Shipment products wrong'; end if;
 if to_jsonb(s)::text like '%PRIVATE%' or s.items_snapshot::text like '%Historical Yuzu%' then raise exception 'Secrets/formulas copied'; end if;
 begin update public.shipments set status='ready_to_ship' where id=s.id; raise exception 'Early ready allowed'; exception when check_violation then null; end;
 begin update public.shipments set address_snapshot='{}' where id=s.id; raise exception 'Address mutable'; exception when check_violation then null; end;
 begin update public.shipments set shipping_cost=99999 where id=s.id; raise exception 'Cost mutable'; exception when check_violation then null; end;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000005',true);
do $$ declare sid uuid; begin
 select id into sid from public.shipments where order_number='SHIPPING-TEST';
 if sid is null then raise exception 'Vendor cannot read fulfillment'; end if;
 if exists(select 1 from public.orders) or exists(select 1 from public.order_items) or exists(select 1 from public.payments)
  or exists(select 1 from public.addresses)
  or exists(select 1 from public.profiles where id<>auth.uid()) then raise exception 'Vendor sees restricted customer data'; end if;
 begin perform public.fulfill_shipment(sid,'ship','JNE','REG','TEST123'); raise exception 'Early ship allowed'; exception when check_violation then null; end;
 begin perform public.fulfill_shipment(sid,'deliver'); raise exception 'Early delivery allowed'; exception when check_violation then null; end;
 begin update public.shipments set courier='HACK' where id=sid; raise exception 'Direct update allowed'; exception when insufficient_privilege then null; end;
 begin delete from public.shipments where id=sid; raise exception 'Direct delete allowed'; exception when insufficient_privilege then null; end;
 begin insert into public.shipments(order_id) values('d2000000-0000-4000-8000-000000000001'); raise exception 'Direct insert allowed'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000001',true);
do $$ declare before_address jsonb; begin
 select address_snapshot into before_address from public.shipments where order_number='SHIPPING-TEST';
 if before_address->>'address_line'<>'Historical Street 1' then raise exception 'Owner cannot read shipment'; end if;
 update public.addresses set address_line='CHANGED SAVED ADDRESS' where id='d4000000-0000-4000-8000-000000000001';
 delete from public.addresses where id='d4000000-0000-4000-8000-000000000001';
 if before_address is distinct from (select address_snapshot from public.shipments where order_number='SHIPPING-TEST') then raise exception 'Live address changed shipment'; end if;
 begin perform public.fulfill_shipment(gen_random_uuid(),'ship'); raise exception 'Customer can mutate'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000003',true);
do $$ begin if exists(select 1 from public.shipments) then raise exception 'Other customer sees shipment'; end if; end $$;
reset role;
-- A missing production job must not be treated as completed.
delete from public.production_jobs where order_item_id='d3000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000005',true);
do $$ declare jid uuid; sid uuid; begin
 for jid in select id from public.production_jobs where order_number='SHIPPING-TEST' loop
  perform public.advance_production_job(jid,'start'); perform public.advance_production_job(jid,'complete');
 end loop;
 select id into sid from public.shipments where order_number='SHIPPING-TEST';
 begin perform public.fulfill_shipment(sid,'ship','JNE','REG','TEST123'); raise exception 'Vendor bypassed shipment readiness'; exception when check_violation then null; end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000002',true);
do $$ begin
 if exists(select 1 from public.shipments) then raise exception 'Perfumer sees customer delivery data'; end if;
 begin perform public.fulfill_shipment(gen_random_uuid(),'ship'); raise exception 'Perfumer can ship'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 if (select status from public.shipments where order_number='SHIPPING-TEST')<>'pending' then raise exception 'Missing job became ready'; end if;
end $$;
insert into public.production_jobs(order_item_id) values('d3000000-0000-4000-8000-000000000003');
set local role authenticated;
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000005',true);
do $$ declare jid uuid; begin
 select id into jid from public.production_jobs where order_item_id='d3000000-0000-4000-8000-000000000003';
 perform public.advance_production_job(jid,'start'); perform public.advance_production_job(jid,'complete');
 perform public.advance_production_job(jid,'complete');
end $$;
reset role;
do $$ declare before_state jsonb; begin
 if (select status from public.shipments where order_number='SHIPPING-TEST')<>'ready_to_ship' then raise exception 'Completed production did not release shipment'; end if;
 select to_jsonb(s) into before_state from public.shipments s where order_number='SHIPPING-TEST';
 perform private.sync_order_shipment('d2000000-0000-4000-8000-000000000001');
 if before_state is distinct from (select to_jsonb(s) from public.shipments s where order_number='SHIPPING-TEST') then raise exception 'Readiness retry changed shipment'; end if;
end $$;
-- A refund/cancellation before dispatch prevents fulfillment; historical snapshots remain.
update public.orders set payment_status='refunded' where id='d2000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000005',true);
do $$ declare sid uuid; begin
 select id into sid from public.shipments where order_number='SHIPPING-TEST';
 begin perform public.fulfill_shipment(sid,'ship','JNE','REG','TEST123'); raise exception 'Refunded order shipped'; exception when check_violation then null; end;
end $$;
reset role;
update public.orders set payment_status='paid',status='cancelled' where id='d2000000-0000-4000-8000-000000000001';
do $$ begin if (select status from public.shipments where order_number='SHIPPING-TEST')<>'pending' then raise exception 'Cancelled order released'; end if; end $$;
update public.orders set status='paid' where id='d2000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000005',true);
do $$ declare sid uuid; s public.shipments; again public.shipments; packed_checklist jsonb:='{"bottles_checked":true,"formula_stickers_checked":true,"bottles_sealed":true,"packaging_ready":true,"recipient_label_checked":true}'; begin
 select id into sid from public.shipments where order_number='SHIPPING-TEST';
 begin perform public.fulfill_shipment(sid,'ship','JNE','REG',''); raise exception 'Tracking not required'; exception when check_violation then null; end;
 begin perform public.fulfill_shipment(sid,'ship',repeat('x',101),'REG','TRACK'); raise exception 'Unbounded details accepted'; exception when check_violation then null; end;
 s:=public.save_shipment_packing(sid,packed_checklist,true);
 perform public.save_actual_shipping(sid,15000,'vendor');
 s:=public.fulfill_shipment(sid,'save',' JNE ',' REG ',' TEST123 ');
 if s.status<>'ready_to_ship' or s.courier<>'JNE' or s.shipped_at is not null then raise exception 'Save marked shipped'; end if;
 s:=public.fulfill_shipment(s.id,'ship','JNE','REG','TEST123'); again:=public.fulfill_shipment(s.id,'ship','JNE','REG','TEST123');
 if s.status<>'shipped' or s.shipped_at is null or to_jsonb(s)<>to_jsonb(again) then raise exception 'Ship/retry failed'; end if;
 begin perform public.fulfill_shipment(s.id,'ship','JNE','REG','OTHER'); raise exception 'Tracking overwritten'; exception when check_violation then null; end;
end $$;
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000001',true);
do $$ begin
 if (select shipment.status from public.shipments shipment where order_number='SHIPPING-TEST')<>'shipped' or (select status from public.orders where order_number='SHIPPING-TEST')<>'shipped' then raise exception 'Customer does not see shipped'; end if;
 if (select tracking_number from public.shipments where order_number='SHIPPING-TEST')<>'TEST123' then raise exception 'Customer missing tracking'; end if;
end $$;
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000004',true);
do $$ declare sid uuid; s public.shipments; again public.shipments; begin
 select id into sid from public.shipments where order_number='SHIPPING-TEST';
 if sid is null then raise exception 'Admin cannot see shipments'; end if;
 s:=public.fulfill_shipment(sid,'deliver'); again:=public.fulfill_shipment(sid,'deliver');
 if s.status<>'delivered' or s.delivered_at is null or to_jsonb(s)<>to_jsonb(again) then raise exception 'Deliver/retry failed'; end if;
end $$;
reset role;
do $$ begin
 if (select status from public.orders where order_number='SHIPPING-TEST')<>'completed' then raise exception 'Order not completed'; end if;
 if (select grand_total from public.orders where order_number='SHIPPING-TEST')<>667000 or (select shipping from public.orders where order_number='SHIPPING-TEST')<>0 then raise exception 'Historical totals changed'; end if;
 if (select address_snapshot->>'address_line' from public.shipments where order_number='SHIPPING-TEST')<>'Historical Street 1' then raise exception 'Historical address changed'; end if;
 if (select count(*) from public.shipments where order_number='SHIPPING-TEST')<>1 then raise exception 'Duplicate shipments'; end if;
end $$;
-- A former customer promoted to vendor must lose access to their own customer records too.
set local role authenticated;
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000001',true);
select public.save_address('d4000000-0000-4000-8000-000000000001','{"recipient_name":"Former Customer","phone":"081234567890","address_line":"Saved Street","city":"Bandung","province":"Jawa Barat","postal_code":"40111","label":"Home"}');
reset role;
update public.profiles set role='vendor' where id='d1000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin
 if exists(select 1 from public.orders) or exists(select 1 from public.order_items) or exists(select 1 from public.payments)
  or exists(select 1 from public.addresses) then raise exception 'Former customer vendor sees historical customer data'; end if;
 begin perform public.quote_order('d4000000-0000-4000-8000-000000000001','[{"product_id":"10ml","quantity":1,"formulas":[{"top":"yuzu","middle":"matcha","base":"vanilla"}]}]'); raise exception 'Vendor can bypass RLS through checkout'; exception when insufficient_privilege then null; end;
 if exists(select 1 from public.shipments where order_number='SHIPPING-TEST') then raise exception 'Unassigned vendor sees another vendor shipment'; end if;
end $$;
reset role;
update public.profiles set role='customer' where id='d1000000-0000-4000-8000-000000000001';
update public.profiles set role='customer' where id='d1000000-0000-4000-8000-000000000005';
set local role authenticated;
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000005',true);
do $$ begin
 if exists(select 1 from public.shipments) then raise exception 'Revoked vendor still sees shipments'; end if;
 begin perform public.fulfill_shipment(gen_random_uuid(),'ship'); raise exception 'Revoked vendor can mutate'; exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
 begin perform 1 from public.shipments; raise exception 'Anon can read'; exception when insufficient_privilege then null; end;
 begin perform public.fulfill_shipment(gen_random_uuid(),'ship'); raise exception 'Anon can mutate'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS: pending/all-jobs readiness, vendor/admin authorization, owner isolation, address snapshots, manual shipping/delivery, retries, protected costs and history' as result;
rollback;
