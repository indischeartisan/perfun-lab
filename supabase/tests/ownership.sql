-- Execute in SQL Editor or psql. All fixtures are rolled back; no real accounts are modified.
begin;
insert into auth.users (id,email,raw_user_meta_data) values
('a1000000-0000-4000-8000-000000000001','perfun-test-a@example.invalid','{"full_name":"Test A","role":"admin"}'),
('a1000000-0000-4000-8000-000000000002','perfun-test-b@example.invalid','{}');
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
do $$ begin
  if (select count(*) from public.profiles) <> 1 then raise exception 'Profile isolation failed'; end if;
  if (select role::text from public.profiles where id=auth.uid()) <> 'customer' then raise exception 'Unsafe role from metadata'; end if;
  update public.profiles set full_name='Updated name' where id=auth.uid();
  begin update public.profiles set role='admin' where id=auth.uid(); raise exception 'Role escalation allowed'; exception when insufficient_privilege then null; end;
  begin update public.notes set name='Changed' where id='yuzu'; raise exception 'Catalog mutation allowed'; exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin if (select count(*) from public.notes)<>18 then raise exception 'Public catalog unavailable'; end if; end $$;
reset role;
do $$ begin
 if to_regclass('public.creations') is not null or to_regclass('public.creation_notes') is not null or to_regprocedure('public.save_creation(uuid,text,text,text,text)') is not null then raise exception 'Creation feature still installed'; end if;
end $$;
rollback;
select 'PASS: profiles, default customer role, metadata protection, catalog grants and removed Creation API' result;
