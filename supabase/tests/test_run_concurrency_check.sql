do $$ declare run private.test_runs; begin
 select * into run from private.test_runs where request_id='f7000000-0000-4000-8000-000000000001';
 if run.status<>'production' or jsonb_array_length(run.events)<>2 then raise exception 'Concurrent duplicate TEST transition applied more than once'; end if;
end $$;
select 'PASS: concurrent duplicate TEST transition' result;
