select id as test_run_id from private.test_runs where request_id='f7000000-0000-4000-8000-000000000001' \gset
set role authenticated;
select set_config('request.jwt.claim.sub','f6000000-0000-4000-8000-000000000002',false);
select public.advance_test_run(:'test_run_id','f8000000-0000-4000-8000-000000000001','start');
