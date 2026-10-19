-- Parameters job_item and action are provided by CI; an open transaction forces overlapping sessions.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000003',true);
select public.advance_production_job((select id from public.production_jobs where order_item_id=:'job_item'::uuid), :'action');
select pg_sleep(2);
commit;
