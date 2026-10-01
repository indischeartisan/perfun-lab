alter table public.orders add column payment_status text not null default 'pending'
 check (payment_status in ('pending','paid','failed','expired','refunded'));
update public.orders set payment_status='paid' where status in ('paid','processing','shipped','completed');

create table public.payments (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id),
 provider text not null, environment text not null check(environment in ('sandbox','production')),
 provider_reference text not null, amount bigint not null check(amount>0), currency text not null default 'IDR' check(currency='IDR'),
 status text not null default 'pending' check(status in ('pending','paid','failed','expired','refunded')),
 paid_at timestamptz, payment_url text, request_payload jsonb not null, metadata jsonb not null default '{}',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(provider,environment,provider_reference)
);
create index payments_order_created_idx on public.payments(order_id,created_at desc);
create unique index payments_one_pending_per_order on public.payments(order_id) where status='pending';
alter table public.payments enable row level security;
revoke all on public.payments from anon,authenticated;
grant select(id,order_id,provider,environment,provider_reference,amount,currency,status,paid_at,created_at,updated_at) on public.payments to authenticated;
grant all on public.payments to service_role;
create policy payments_read_own on public.payments for select to authenticated using(exists(select 1 from public.orders o where o.id=order_id and o.user_id=(select auth.uid())));

create table private.payment_events (
 id bigint generated always as identity primary key, payment_id uuid not null references public.payments(id),
 event_key text not null, provider text not null, environment text not null, status text not null,
 metadata jsonb not null default '{}', created_at timestamptz not null default now(), unique(provider,environment,event_key)
);
create index payment_events_payment_idx on private.payment_events(payment_id);
alter table private.payment_events enable row level security;
revoke all on private.payment_events from public,anon,authenticated;
grant usage on schema private to service_role;
grant all on private.payment_events to service_role;
grant usage,select on sequence private.payment_events_id_seq to service_role;

-- All mutation RPCs are invoker functions executable ONLY by the server service role.
create function public.reserve_payment(p_order_id uuid,p_user_id uuid,p_provider text,p_environment text,p_return_url text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare o public.orders; p public.payments; new_id uuid := gen_random_uuid();
begin
 select * into o from public.orders where id=p_order_id and user_id=p_user_id for update;
 if not found then raise exception 'Order not found' using errcode='42501'; end if;
 if o.status<>'pending_payment' or o.payment_status in ('paid','refunded') then raise exception 'Order is not payable'; end if;
 if o.grand_total<=0 or o.grand_total>999999999999 then raise exception 'Unsupported payment amount'; end if;
 select * into p from public.payments where order_id=o.id and status='pending';
 if found then
  if p.provider<>p_provider or p.environment<>p_environment then raise exception 'Existing payment uses another provider environment'; end if;
  return to_jsonb(p);
 end if;
 insert into public.payments(id,order_id,provider,environment,provider_reference,amount,request_payload)
 values(new_id,o.id,p_provider,p_environment,'PF'||substr(replace(new_id::text,'-',''),1,28),o.grand_total,
  jsonb_build_object('amount',o.grand_total,'currency',o.currency,'return_url',p_return_url)) returning * into p;
 update public.orders set payment_status='pending' where id=o.id and payment_status<>'pending';
 return to_jsonb(p);
end $$;

create function public.attach_payment_session(p_payment_id uuid,p_url text,p_metadata jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.payments; oid uuid;
begin
 select order_id into oid from public.payments where id=p_payment_id;
 perform 1 from public.orders where id=oid for update;
 select * into p from public.payments where id=p_payment_id for update;
 if not found then raise exception 'Payment not found'; end if;
 -- A notification can arrive before the provider session response. Never reset its status.
 if p.payment_url is null then
  update public.payments set payment_url=p_url,metadata=metadata||p_metadata,updated_at=now() where id=p.id returning * into p;
 end if;
 return to_jsonb(p);
end $$;

create function public.apply_payment_event(p_payment_id uuid,p_event_key text,p_amount bigint,p_status text,p_paid_at timestamptz,p_metadata jsonb)
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
   paid_at=case when new_status in ('paid','refunded') then coalesce(p.paid_at,p_paid_at,now()) else p.paid_at end,
   metadata=metadata||p_metadata,updated_at=now() where id=p.id;
 end if;
 -- Old failures cannot overwrite a newer pending/paid attempt. Paid never regresses on late events.
 select case
  when exists(select 1 from public.payments where order_id=oid and status='paid') then 'paid'
  when exists(select 1 from public.payments where order_id=oid and status='refunded') then 'refunded'
  when exists(select 1 from public.payments where order_id=oid and status='pending') then 'pending'
  else (select status from public.payments where order_id=oid order by created_at desc,id desc limit 1) end into aggregate_status;
 update public.orders set payment_status=aggregate_status,
  status=case when aggregate_status='paid' and status='pending_payment' then 'paid' else status end
 where id=oid and (payment_status<>aggregate_status or (aggregate_status='paid' and status='pending_payment'));
 return jsonb_build_object('duplicate',false,'status',new_status,'order_payment_status',aggregate_status);
end $$;
revoke all on function public.reserve_payment(uuid,uuid,text,text,text),public.attach_payment_session(uuid,text,jsonb),public.apply_payment_event(uuid,text,bigint,text,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.reserve_payment(uuid,uuid,text,text,text),public.attach_payment_session(uuid,text,jsonb),public.apply_payment_event(uuid,text,bigint,text,timestamptz,jsonb) to service_role;
