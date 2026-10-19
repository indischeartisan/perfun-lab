do $$ begin
 if (select count(*) from public.production_jobs where order_number='RACE-TEST' and status='completed')<>2 then
  raise exception 'Concurrent completion lost or duplicated a job';
 end if;
 if (select status from public.shipments where order_id='d2000000-0000-4000-8000-000000000001')<>'ready_to_ship' then
  raise exception 'Concurrent completion did not make shipment ready';
 end if;
 if exists(select 1 from public.production_jobs where order_number='RACE-TEST' and assigned_to<>'d1000000-0000-4000-8000-000000000003') then
  raise exception 'Concurrent action changed ownership';
 end if;
end $$;
select 'PASS: two-session start retry and concurrent completion of two jobs' result;
