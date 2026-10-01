begin;
insert into auth.users(id,email) values
 ('f1000000-0000-4000-8000-000000000001','production-customer@example.invalid'),
 ('f1000000-0000-4000-8000-000000000002','production-perfumer-a@example.invalid'),
 ('f1000000-0000-4000-8000-000000000003','production-perfumer-b@example.invalid'),
 ('f1000000-0000-4000-8000-000000000004','production-admin@example.invalid'),
 ('f1000000-0000-4000-8000-000000000005','production-vendor@example.invalid');
update public.profiles set role='perfumer' where id in ('f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000003');
update public.profiles set role='admin' where id='f1000000-0000-4000-8000-000000000004';
update public.profiles set role='vendor' where id='f1000000-0000-4000-8000-000000000005';
insert into public.orders(id,order_number,user_id,request_id,request_payload,address_snapshot,subtotal,discount,shipping,grand_total)
 values('f2000000-0000-4000-8000-000000000001','PRODUCTION-TEST','f1000000-0000-4000-8000-000000000001',gen_random_uuid(),'{}','{"recipient_name":"PRIVATE CUSTOMER"}',727000,60000,0,667000);
insert into public.order_items(id,order_id,position,product_snapshot,creations_snapshot,quantity,normal_unit_price,unit_price,line_total)
 select ('f3000000-0000-4000-8000-00000000000'||n)::uuid,'f2000000-0000-4000-8000-000000000001',n,
 jsonb_build_object('label',case n when 1 then '10 ML' when 2 then '30 ML' else 'Bundle 3x10ml' end,'volume_ml',case n when 2 then 30 else 10 end,'bottle_count',case n when 3 then 3 else 1 end,'secret_extra','PRIVATE'),
 (select jsonb_agg(jsonb_build_object('id',gen_random_uuid(),'name','PRIVATE CREATION','notes',jsonb_build_array(
 jsonb_build_object('phase','top','note',jsonb_build_object('id','yuzu','name','Historical Yuzu '||b)),
 jsonb_build_object('phase','middle','note',jsonb_build_object('id','rose','name','Historical Rose')),
 jsonb_build_object('phase','base','note',jsonb_build_object('id','musk','name','Historical Musk'))))) from generate_series(1,case n when 3 then 3 else 1 end) b),
 case n when 1 then 2 else 1 end,129000,109000,109000*(case n when 1 then 2 else 1 end)
 from generate_series(1,3) n;
do $$ begin
 if exists(select 1 from public.production_jobs where order_number='PRODUCTION-TEST') then raise exception 'Unpaid item queued'; end if;
 begin insert into public.production_jobs(order_item_id) values('f3000000-0000-4000-8000-000000000001'); raise exception 'Unpaid direct insert allowed';
 exception when check_violation then null; end;
end $$;
-- Actual payment event RPC, rather than manually inserting jobs.
set local role service_role;
do $$ declare payment jsonb; before_snapshot jsonb; begin
 payment:=public.reserve_payment('f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001','doku','sandbox','https://example.invalid');
 perform public.apply_payment_event((payment->>'id')::uuid,'production-paid',667000,'paid',now(),'{}');
 select jsonb_agg(to_jsonb(j) order by id) into before_snapshot from public.production_jobs j where order_number='PRODUCTION-TEST';
 perform public.apply_payment_event((payment->>'id')::uuid,'production-paid',667000,'paid',now(),'{}');
 perform public.apply_payment_event((payment->>'id')::uuid,'late-failure',667000,'failed',null,'{}');
 update public.orders set payment_status='paid' where id='f2000000-0000-4000-8000-000000000001';
 if (select count(*) from public.production_jobs where order_number='PRODUCTION-TEST')<>3 then raise exception 'Not one job per item'; end if;
 if before_snapshot is distinct from (select jsonb_agg(to_jsonb(j) order by id) from public.production_jobs j where order_number='PRODUCTION-TEST') then raise exception 'Retry changed jobs'; end if;
end $$;
reset role;
do $$ declare job public.production_jobs; begin
 select * into job from public.production_jobs where order_item_id='f3000000-0000-4000-8000-000000000003';
 if jsonb_array_length(job.formulas_snapshot)<>3 or job.formulas_snapshot->2->>'top'<>'Historical Yuzu 3' then raise exception 'Bundle snapshot missing'; end if;
 if to_jsonb(job)::text like '%PRIVATE%' then raise exception 'Sensitive snapshot fields exposed'; end if;
 update public.notes set name='LIVE EDIT' where id='yuzu';
 if (select formulas_snapshot from public.production_jobs where id=job.id)<>job.formulas_snapshot then raise exception 'Live catalog changed job'; end if;
 begin update public.production_jobs set quantity=99 where id=job.id; raise exception 'Snapshot mutable'; exception when check_violation then null; end;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true);
do $$ declare job_id uuid; begin
 if exists(select 1 from public.production_jobs) then raise exception 'Customer sees production'; end if;
 begin perform public.advance_production_job(gen_random_uuid(),'start'); raise exception 'Customer action allowed'; exception when insufficient_privilege then null; end;
 begin insert into public.production_jobs(order_item_id) values('f3000000-0000-4000-8000-000000000001'); raise exception 'Client insert allowed'; exception when insufficient_privilege then null; end;
 begin update public.profiles set role='perfumer' where id=auth.uid(); raise exception 'Self promotion allowed'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000005',true);
do $$ begin
 if exists(select 1 from public.production_jobs) then raise exception 'Vendor sees jobs'; end if;
 begin perform public.advance_production_job(gen_random_uuid(),'start'); raise exception 'Vendor action allowed'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000004',true);
do $$ begin
 if (select count(*) from public.production_jobs where order_number='PRODUCTION-TEST')<>3 then raise exception 'Admin cannot read all jobs'; end if;
 begin perform public.advance_production_job(gen_random_uuid(),'start'); raise exception 'Read-only admin can act'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000002',true);
do $$ declare job public.production_jobs; again public.production_jobs; begin
 if exists(select 1 from public.orders) or exists(select 1 from public.order_items) or exists(select 1 from public.payments) then raise exception 'Perfumer sees customer financials'; end if;
 if exists(select 1 from public.profiles where id<>auth.uid()) or exists(select 1 from public.addresses) then raise exception 'Perfumer sees customer history'; end if;
 select * into job from public.production_jobs where order_item_id='f3000000-0000-4000-8000-000000000001';
 begin update public.production_jobs set status='completed' where id=job.id; raise exception 'Direct update permitted'; exception when insufficient_privilege then null; end;
 begin delete from public.production_jobs where id=job.id; raise exception 'Delete permitted'; exception when insufficient_privilege then null; end;
 begin perform public.advance_production_job(job.id,'complete'); raise exception 'Queued completion allowed'; exception when insufficient_privilege then null; end;
 job:=public.advance_production_job(job.id,'start');
 if job.status<>'in_production' or job.assigned_to<>auth.uid() or job.started_at is null then raise exception 'Start failed'; end if;
 again:=public.advance_production_job(job.id,'start');
 if to_jsonb(job)<>to_jsonb(again) then raise exception 'Start retry changed timestamp'; end if;
end $$;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000003',true);
do $$ declare jid uuid; begin
 select id into jid from public.production_jobs where order_item_id='f3000000-0000-4000-8000-000000000001';
 begin perform public.advance_production_job(jid,'start'); raise exception 'Second perfumer stole job'; exception when check_violation then null; end;
 begin perform public.advance_production_job(jid,'complete'); raise exception 'Second perfumer completed job'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000002',true);
do $$ declare job public.production_jobs; again public.production_jobs; begin
 select * into job from public.production_jobs where order_item_id='f3000000-0000-4000-8000-000000000001';
 job:=public.advance_production_job(job.id,'complete'); again:=public.advance_production_job(job.id,'complete');
 if job.status<>'completed' or job.completed_at is null or to_jsonb(job)<>to_jsonb(again) then raise exception 'Complete/retry failed'; end if;
 again:=public.advance_production_job(job.id,'start');
 if to_jsonb(job)<>to_jsonb(again) then raise exception 'Completed job reopened'; end if;
end $$;
reset role;
-- Refund/eligibility changes retain history but block further production actions.
update public.orders set payment_status='refunded' where id='f2000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000002',true);
do $$ declare jid uuid; begin
 if exists(select 1 from public.production_jobs where order_number='PRODUCTION-TEST' and production_allowed) then raise exception 'Refund did not hold jobs'; end if;
 select id into jid from public.production_jobs where order_item_id='f3000000-0000-4000-8000-000000000002';
 begin perform public.advance_production_job(jid,'start'); raise exception 'Refunded job started'; exception when check_violation then null; end;
end $$;
reset role;
update public.profiles set role='customer' where id='f1000000-0000-4000-8000-000000000002';
set local role authenticated;
do $$ begin
 if exists(select 1 from public.production_jobs) then raise exception 'Revoked role still sees jobs'; end if;
 begin perform public.advance_production_job(gen_random_uuid(),'start'); raise exception 'Revoked role can act'; exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
 begin perform 1 from public.production_jobs; raise exception 'Anon sees jobs'; exception when insufficient_privilege then null; end;
 begin perform public.advance_production_job(gen_random_uuid(),'start'); raise exception 'Anon action allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS: paid-only automatic queue, bundle snapshots, retry idempotency, transitions, assignment, role isolation, refund hold and immutable history' as result;
rollback;
