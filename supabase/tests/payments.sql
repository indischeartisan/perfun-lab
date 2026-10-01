begin;
insert into auth.users(id,email) values ('e1000000-0000-4000-8000-000000000001','payment-a@example.invalid'),('e1000000-0000-4000-8000-000000000002','payment-b@example.invalid');
insert into public.orders(id,order_number,user_id,request_id,request_payload,address_snapshot,subtotal,discount,shipping,grand_total) values
 ('e2000000-0000-4000-8000-000000000001','PAYMENT-TEST-1','e1000000-0000-4000-8000-000000000001',gen_random_uuid(),'{}','{"address_line":"Historical street"}',129000,20000,0,109000),
 ('e2000000-0000-4000-8000-000000000002','PAYMENT-TEST-2','e1000000-0000-4000-8000-000000000001',gen_random_uuid(),'{}','{"address_line":"Historical street"}',229000,30000,0,199000);
set local role service_role;
do $$ declare p jsonb; again jsonb; pid uuid; row_before text; order_before text; result jsonb; begin
 p:=public.reserve_payment('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','doku','sandbox','https://example.invalid/#orders'); pid:=(p->>'id')::uuid;
 again:=public.reserve_payment('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','doku','sandbox','https://changed.example.invalid');
 if p->>'id'<>again->>'id' or p->'request_payload'<>again->'request_payload' or (p->>'amount')::bigint<>109000 then raise exception 'Reservation/idempotency/amount failed'; end if;
 begin perform public.apply_payment_event(pid,'wrong-amount',1,'paid',now(),'{}'); raise exception 'Tampered amount accepted'; exception when raise_exception then if sqlerrm='Tampered amount accepted' then raise; end if; end;
 perform public.apply_payment_event(pid,'paid-event',109000,'paid',now(),'{"source":"test"}');
 select ctid::text into row_before from public.payments where id=pid;
 select ctid::text into order_before from public.orders where id='e2000000-0000-4000-8000-000000000001';
 result:=public.apply_payment_event(pid,'paid-event',109000,'paid',now(),'{"source":"test"}');
 if result->>'duplicate'<>'true' then raise exception 'Replay not detected'; end if;
 perform public.apply_payment_event(pid,'late-failure',109000,'failed',null,'{}');
 perform public.apply_payment_event(pid,'late-pending',109000,'pending',null,'{}');
 if (select ctid::text from public.payments where id=pid)<>row_before or (select ctid::text from public.orders where id='e2000000-0000-4000-8000-000000000001')<>order_before then raise exception 'Replay/late status wrote paid rows'; end if;
 if (select status from public.orders where id='e2000000-0000-4000-8000-000000000001')<>'paid' then raise exception 'Order not paid'; end if;
 -- Session response arriving AFTER webhook must not regress paid status.
 perform public.attach_payment_session(pid,'https://sandbox.doku.com/test','{}');
 if (select status from public.payments where id=pid)<>'paid' then raise exception 'Session reset paid'; end if;
 begin perform public.reserve_payment('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','doku','sandbox','https://example.invalid'); raise exception 'Paid order reopened'; exception when raise_exception then if sqlerrm='Paid order reopened' then raise; end if; end;
 perform public.apply_payment_event(pid,'refund-event',109000,'refunded',null,'{}');
 perform public.apply_payment_event(pid,'late-success',109000,'paid',now(),'{}');
 if (select payment_status from public.orders where id='e2000000-0000-4000-8000-000000000001')<>'refunded' then raise exception 'Refund regressed'; end if;
 if (select grand_total from public.orders where id='e2000000-0000-4000-8000-000000000001')<>109000 or (select address_snapshot->>'address_line' from public.orders where id='e2000000-0000-4000-8000-000000000001')<>'Historical street' then raise exception 'Snapshot changed'; end if;
 p:=public.reserve_payment('e2000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000001','doku','sandbox','https://example.invalid');
 perform public.apply_payment_event((p->>'id')::uuid,'expiry',199000,'expired',null,'{}');
 again:=public.reserve_payment('e2000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000001','doku','sandbox','https://example.invalid');
 if p->>'id'=again->>'id' then raise exception 'Expired attempt reused'; end if;
 perform public.apply_payment_event((p->>'id')::uuid,'old-expiry',199000,'expired',null,'{}');
 if (select payment_status from public.orders where id='e2000000-0000-4000-8000-000000000002')<>'pending' then raise exception 'Old attempt overwrote new attempt'; end if;
 perform public.apply_payment_event((again->>'id')::uuid,'creation-rejected',199000,'failed',null,'{}');
 if (select status from public.orders where id='e2000000-0000-4000-8000-000000000002')<>'pending_payment' or (select payment_status from public.orders where id='e2000000-0000-4000-8000-000000000002')<>'failed' then raise exception 'Failed status incorrect'; end if;
 if (select count(*) from public.orders where user_id='e1000000-0000-4000-8000-000000000001')<>2 then raise exception 'Duplicate order'; end if;
 begin perform public.reserve_payment('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000002','doku','sandbox','https://example.invalid'); raise exception 'Foreign order accepted'; exception when insufficient_privilege then null; end;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000001',true);
do $$ begin
 if (select count(id) from public.payments)<>3 then raise exception 'Own payments unreadable'; end if;
 begin perform metadata from public.payments; raise exception 'Private metadata exposed'; exception when insufficient_privilege then null; end;
 begin update public.payments set status='paid'; raise exception 'Client payment write allowed'; exception when insufficient_privilege then null; end;
 begin update public.orders set payment_status='paid'; raise exception 'Client paid order allowed'; exception when insufficient_privilege then null; end;
 begin perform public.apply_payment_event(gen_random_uuid(),'fake',109000,'paid',now(),'{}'); raise exception 'Client payment RPC allowed'; exception when insufficient_privilege then null; end;
 begin perform public.reserve_payment(gen_random_uuid(),auth.uid(),'doku','sandbox','https://example.invalid'); raise exception 'Client reserve RPC allowed'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000002',true);
do $$ begin if exists(select id from public.payments) then raise exception 'Cross-customer payment access'; end if; end $$;
reset role;
rollback;
select 'PASS: payment RLS, server-only mutation, immutable snapshots, reservation retries, webhook deduplication, terminal states and Pay Again' as result;
