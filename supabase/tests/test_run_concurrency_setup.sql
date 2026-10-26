insert into auth.users(id,email) values
 ('f6000000-0000-4000-8000-000000000001','test-concurrency-admin@example.invalid'),
 ('f6000000-0000-4000-8000-000000000002','test-concurrency-vendor@example.invalid');
update public.profiles set role='admin' where id='f6000000-0000-4000-8000-000000000001';
update public.profiles set role='vendor' where id='f6000000-0000-4000-8000-000000000002';
update private.admin_testing_preflight_settings set mode_enabled=true where singleton;
set role authenticated;
select set_config('request.jwt.claim.sub','f6000000-0000-4000-8000-000000000001',false);
select public.create_test_run('f7000000-0000-4000-8000-000000000001','f6000000-0000-4000-8000-000000000002','Fictional',10,1,1,'[{"top":"A","middle":"B","base":"C"}]');
