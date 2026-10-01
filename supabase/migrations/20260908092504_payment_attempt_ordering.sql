alter table public.payments add column attempt_sequence bigint generated always as identity;
grant usage,select on sequence public.payments_attempt_sequence_seq to service_role;

create or replace function public.apply_payment_event(p_payment_id uuid,p_event_key text,p_amount bigint,p_status text,p_paid_at timestamptz,p_metadata jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.payments; oid uuid; new_status text; aggregate_status text; inserted integer;
begin
 select order_id into oid from public.payments where id=p_payment_id;
 perform 1 from public.orders where id=oid for update;
 select * into p from public.payments where id=p_payment_id for update;
 if not found then raise exception 'Payment not found'; end if;
 if p_amount<>p.amount or p_amount is null then raise exception 'Payment amount mismatch'; end if;
 if p_status not in ('pending','paid','failed','expired','refunded') or p_status is null then raise exception 'Invalid payment status'; end if;
 insert into private.payment_events(payment_id,event_key,provider,environment,status,metadata)
 values(p.id,p_event_key,p.provider,p.environment,p_status,p_metadata) on conflict(provider,environment,event_key) do nothing;
 get diagnostics inserted=row_count;
 if inserted=0 then return jsonb_build_object('duplicate',true,'status',p.status); end if;
 new_status:=p.status;
 if p.status='refunded' then null;
 elsif p_status='refunded' then new_status:='refunded';
 elsif p_status='paid' then new_status:='paid';
 elsif p.status='paid' then null;
 elsif p.status='pending' then new_status:=p_status;
 end if;
 if new_status<>p.status then
  update public.payments set status=new_status,
   paid_at=case when new_status='paid' then coalesce(p.paid_at,p_paid_at,now()) else p.paid_at end,
   metadata=metadata||p_metadata,updated_at=now() where id=p.id;
 end if;
 -- Old failures cannot overwrite a newer pending/paid attempt. Paid never regresses on late events.
 select case
  when exists(select 1 from public.payments where order_id=oid and status='paid') then 'paid'
  when exists(select 1 from public.payments where order_id=oid and status='refunded') then 'refunded'
  when exists(select 1 from public.payments where order_id=oid and status='pending') then 'pending'
  else (select status from public.payments where order_id=oid order by attempt_sequence desc limit 1) end into aggregate_status;
 update public.orders set payment_status=aggregate_status,
  status=case when aggregate_status='paid' and status='pending_payment' then 'paid' else status end
 where id=oid and (payment_status<>aggregate_status or (aggregate_status='paid' and status='pending_payment'));
 return jsonb_build_object('duplicate',false,'status',new_status,'order_payment_status',aggregate_status);
end $$;
