-- Disposable regression for the atomic, assigned-vendor tracking correction.
begin;
insert into auth.users(id,email) values
 ('e1000000-0000-4000-8000-000000000001','tracking-customer@example.invalid'),
 ('e1000000-0000-4000-8000-000000000002','tracking-admin@example.invalid'),
 ('e1000000-0000-4000-8000-000000000003','tracking-vendor-a@example.invalid'),
 ('e1000000-0000-4000-8000-000000000004','tracking-vendor-b@example.invalid'),
 ('e1000000-0000-4000-8000-000000000005','tracking-perfumer@example.invalid');
update public.profiles set role='admin' where id='e1000000-0000-4000-8000-000000000002';
update public.profiles set role='vendor' where id in ('e1000000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000004');
update public.profiles set role='perfumer' where id='e1000000-0000-4000-8000-000000000005';
insert into public.orders(id,order_number,user_id,request_id,request_payload,address_snapshot,subtotal,discount,shipping,grand_total,payment_status,status)
values ('e2000000-0000-4000-8000-000000000001','TRACKING-CORRECTION','e1000000-0000-4000-8000-000000000001',gen_random_uuid(),'{}','{"recipient_name":"Tracking Recipient","phone":"081200000000","address_line":"Tracking Street 1","city":"Bandung","province":"Jawa Barat","postal_code":"40111"}',50000,0,10000,60000,'paid','paid');
insert into public.order_items(id,order_id,position,product_snapshot,creations_snapshot,quantity,normal_unit_price,unit_price,line_total)
values ('e3000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001',1,'{"id":"10ml","label":"10 ML","volume_ml":10,"bottle_count":1}','[]',1,50000,50000,50000);

set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000002',true);
select public.admin_assign_vendor('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000003');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000003',true);
do $$ declare job_id uuid; tracking_shipment_id uuid; before_count integer; before_tracking text; before_shipped_at timestamptz; affected integer; begin
 select id into job_id from public.production_jobs where order_item_id='e3000000-0000-4000-8000-000000000001';
 perform public.advance_production_job(job_id,'start');
 perform public.advance_production_job(job_id,'complete');
 select id into tracking_shipment_id from public.shipments where order_id='e2000000-0000-4000-8000-000000000001';
 begin perform public.correct_shipment_tracking(tracking_shipment_id,'EARLY-TRACK'); raise exception 'Ready shipment tracking was corrected'; exception when check_violation then null; end;
 perform public.fulfill_shipment(tracking_shipment_id,'ship','J&T','EZ','TRACK-OLD');
 select tracking_number into before_tracking from public.shipments where id=tracking_shipment_id;
 select shipped_at into before_shipped_at from public.shipments where id=tracking_shipment_id;
 select count(*) into before_count from private.shipment_tracking_corrections c where c.shipment_id=tracking_shipment_id;
 begin perform public.correct_shipment_tracking(tracking_shipment_id,''); raise exception 'Empty tracking correction was accepted'; exception when check_violation then null; end;
 begin perform public.correct_shipment_tracking(tracking_shipment_id,E'BAD\nTRACK'); raise exception 'Control character tracking correction was accepted'; exception when check_violation then null; end;
 if (select tracking_number from public.shipments where id=tracking_shipment_id)<>before_tracking or (select count(*) from private.shipment_tracking_corrections c where c.shipment_id=tracking_shipment_id)<>before_count then raise exception 'Invalid correction was not atomic'; end if;
 perform public.correct_shipment_tracking(tracking_shipment_id,'TRACK-NEW');
 if (select tracking_number from public.shipments where id=tracking_shipment_id)<>'TRACK-NEW' or (select status from public.shipments where id=tracking_shipment_id)<>'shipped' or (select courier from public.shipments where id=tracking_shipment_id)<>'J&T' or (select service from public.shipments where id=tracking_shipment_id)<>'EZ' or (select shipped_at from public.shipments where id=tracking_shipment_id) is distinct from before_shipped_at or (select actual_shipping_cost from public.shipments where id=tracking_shipment_id) is not null then raise exception 'Tracking correction changed protected shipment fields'; end if;
 if (select count(*) from private.shipment_tracking_corrections c where c.shipment_id=tracking_shipment_id)<>before_count+1 then raise exception 'Tracking audit was not written'; end if;
 if not exists(select 1 from private.shipment_tracking_corrections c where c.shipment_id=tracking_shipment_id and previous_tracking_number='TRACK-OLD' and new_tracking_number='TRACK-NEW' and corrected_by='e1000000-0000-4000-8000-000000000003') then raise exception 'Tracking audit payload is incomplete'; end if;
 perform public.correct_shipment_tracking(tracking_shipment_id,'TRACK-NEW');
 if (select count(*) from private.shipment_tracking_corrections c where c.shipment_id=tracking_shipment_id)<>before_count+1 then raise exception 'Idempotent tracking retry wrote duplicate audit'; end if;
 begin
  update public.shipments set tracking_number='DIRECT-UPDATE' where id=tracking_shipment_id;
  get diagnostics affected = row_count;
  if affected<>0 then raise exception 'Direct client shipment update was allowed'; end if;
 exception when insufficient_privilege then null;
 end;
 perform set_config('app.tracking_shipment_id',tracking_shipment_id::text,false);
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000004',true);
do $$ begin
 begin perform public.correct_shipment_tracking(current_setting('app.tracking_shipment_id')::uuid,'TRACK-OTHER-VENDOR'); raise exception 'Unassigned vendor corrected tracking'; exception when insufficient_privilege then null; end;
 begin perform 1 from private.shipment_tracking_corrections; raise exception 'Vendor read private tracking audit'; exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000005',true);
do $$ begin
 begin perform public.correct_shipment_tracking(current_setting('app.tracking_shipment_id')::uuid,'TRACK-PERFUMER'); raise exception 'Perfumer corrected tracking'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000001',true);
do $$ begin
 begin perform public.correct_shipment_tracking(current_setting('app.tracking_shipment_id')::uuid,'TRACK-CUSTOMER'); raise exception 'Customer corrected tracking'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000002',true);
do $$ declare shipment public.shipments; shipped_time timestamptz; begin
 select shipped_at into shipped_time from public.shipments where id=current_setting('app.tracking_shipment_id')::uuid;
 shipment:=public.correct_shipment_tracking(current_setting('app.tracking_shipment_id')::uuid,'TRACK-ADMIN');
 if shipment.status<>'shipped' or shipment.shipped_at is distinct from shipped_time or shipment.tracking_number<>'TRACK-ADMIN' then raise exception 'Admin correction changed dispatch state'; end if;
 perform public.fulfill_shipment(shipment.id,'deliver','','','');
 begin perform public.correct_shipment_tracking(shipment.id,'TRACK-DELIVERED'); raise exception 'Delivered shipment tracking was corrected'; exception when check_violation then null; end;
end $$;
reset role;
select 'PASS: tracking correction authorization, validation, atomic audit, idempotency, and finality' as result;
rollback;
