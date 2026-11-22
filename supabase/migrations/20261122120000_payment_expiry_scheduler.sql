-- Payment deadlines are authoritative from order creation, not from the first
-- attempt to open a provider session.
alter table public.orders add column if not exists payment_deadline_at timestamptz;
update public.orders
set payment_deadline_at = created_at + interval '60 minutes'
where payment_deadline_at is null;
alter table public.orders alter column payment_deadline_at set not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='orders_payment_deadline_check') then
    alter table public.orders add constraint orders_payment_deadline_check
      check (payment_deadline_at >= created_at and payment_deadline_at <= created_at + interval '60 minutes');
  end if;
end $$;

create index if not exists orders_payment_expiry_idx
  on public.orders(payment_deadline_at, id)
  where status='pending_payment' and payment_status='pending';

create or replace function private.guard_payment_deadline()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' then
    new.payment_deadline_at:=coalesce(new.payment_deadline_at,new.created_at+interval '60 minutes');
  elsif new.payment_deadline_at is distinct from old.payment_deadline_at then
    raise exception 'Payment deadline is immutable' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function private.guard_payment_deadline() from public,anon,authenticated;
drop trigger if exists orders_payment_deadline_guard on public.orders;
create trigger orders_payment_deadline_guard before insert or update on public.orders
for each row execute function private.guard_payment_deadline();

create or replace function public.reserve_payment(p_order_id uuid,p_user_id uuid,p_provider text,p_environment text,p_return_url text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare o public.orders; p public.payments; new_id uuid := gen_random_uuid(); due_minutes integer;
begin
  select * into o from public.orders where id=p_order_id and user_id=p_user_id for update;
  if not found then raise exception 'Order not found' using errcode='42501'; end if;
  if o.status<>'pending_payment' or o.payment_status in ('paid','refunded') then raise exception 'Order is not payable'; end if;
  if clock_timestamp()>=o.payment_deadline_at then raise exception 'Payment deadline has passed' using errcode='P0001'; end if;
  due_minutes:=floor(extract(epoch from (o.payment_deadline_at-clock_timestamp()))/60)::integer;
  if due_minutes<1 then raise exception 'Payment deadline has passed' using errcode='P0001'; end if;
  if o.grand_total<=0 or o.grand_total>999999999999 then raise exception 'Unsupported payment amount'; end if;
  select * into p from public.payments where order_id=o.id and status='pending';
  if found then
    if p.provider<>p_provider or p.environment<>p_environment then raise exception 'Existing payment uses another provider environment'; end if;
    return to_jsonb(p)||jsonb_build_object('payment_deadline_at',o.payment_deadline_at);
  end if;
  insert into public.payments(id,order_id,provider,environment,provider_reference,amount,request_payload)
  values(new_id,o.id,p_provider,p_environment,'PF'||substr(replace(new_id::text,'-',''),1,28),o.grand_total,
    jsonb_build_object('amount',o.grand_total,'currency',o.currency,'return_url',p_return_url,'payment_due_date',least(60,due_minutes))) returning * into p;
  update public.orders set payment_status='pending' where id=o.id and payment_status<>'pending';
  return to_jsonb(p)||jsonb_build_object('payment_deadline_at',o.payment_deadline_at);
end $$;

create or replace function public.attach_payment_session(p_payment_id uuid,p_url text,p_metadata jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.payments; o public.orders; oid uuid;
begin
  select order_id into oid from public.payments where id=p_payment_id;
  select * into o from public.orders where id=oid for update;
  select * into p from public.payments where id=p_payment_id for update;
  if not found then raise exception 'Payment not found'; end if;
  if clock_timestamp()>=o.payment_deadline_at and p.status='pending' then raise exception 'Payment deadline has passed' using errcode='P0001'; end if;
  -- A notification can arrive before the provider session response. Never reset its status.
  if p.payment_url is null then
    update public.payments set payment_url=p_url,metadata=metadata||p_metadata,updated_at=now() where id=p.id returning * into p;
  end if;
  return to_jsonb(p)||jsonb_build_object('payment_deadline_at',o.payment_deadline_at);
end $$;

create or replace function public.apply_payment_event(p_payment_id uuid,p_event_key text,p_amount bigint,p_status text,p_paid_at timestamptz,p_metadata jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.payments; o public.orders; oid uuid; new_status text; aggregate_status text; inserted integer;
begin
  select order_id into oid from public.payments where id=p_payment_id;
  select * into o from public.orders where id=oid for update;
  select * into p from public.payments where id=p_payment_id for update;
  if not found then raise exception 'Payment not found'; end if;
  if p_amount<>p.amount or p_amount is null then raise exception 'Payment amount mismatch'; end if;
  if p_status not in ('pending','paid','failed','expired','refunded') or p_status is null then raise exception 'Invalid payment status'; end if;
  insert into private.payment_events(payment_id,event_key,provider,environment,status,metadata)
  values(p.id,p_event_key,p.provider,p.environment,p_status,p_metadata) on conflict(provider,environment,event_key) do nothing;
  get diagnostics inserted=row_count;
  if inserted=0 then return jsonb_build_object('duplicate',true,'status',p.status); end if;
  -- A late paid callback is not allowed to resurrect an order after the
  -- authoritative deadline or after a verified expiry. The event is retained
  -- for audit/idempotency, but inventory remains released.
  if p_status='paid' and (p.status in ('expired','refunded') or p_paid_at is null or p_paid_at>o.payment_deadline_at) then
    return jsonb_build_object('duplicate',false,'late_paid',true,'status',p.status);
  end if;
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
  select case
    when exists(select 1 from public.payments where order_id=oid and status='paid') then 'paid'
    when exists(select 1 from public.payments where order_id=oid and status='refunded') then 'refunded'
    when exists(select 1 from public.payments where order_id=oid and status='pending') then 'pending'
    else (select status from public.payments where order_id=oid order by attempt_sequence desc limit 1) end into aggregate_status;
  update public.orders set payment_status=aggregate_status,
    status=case when aggregate_status='paid' and status='pending_payment' then 'paid'
      when aggregate_status='expired' and status='pending_payment' then 'cancelled' else status end
    where id=oid and (payment_status<>aggregate_status or (aggregate_status='paid' and status='pending_payment') or (aggregate_status='expired' and status='pending_payment'));
  return jsonb_build_object('duplicate',false,'status',new_status,'order_payment_status',aggregate_status);
end $$;

-- The scheduler calls the Edge Function with a database-generated token. This
-- avoids adding another operator-managed secret while keeping the endpoint
-- unusable to anonymous callers.
create table if not exists private.payment_expiry_scheduler (
  singleton boolean primary key default true check (singleton),
  token text not null unique default encode(gen_random_bytes(32),'hex'),
  created_at timestamptz not null default clock_timestamp()
);
insert into private.payment_expiry_scheduler(singleton) values(true) on conflict(singleton) do nothing;
alter table private.payment_expiry_scheduler enable row level security;
revoke all on private.payment_expiry_scheduler from public,anon,authenticated;
create or replace function public.payment_expiry_authorize(p_token text)
returns boolean language sql security definer set search_path='' as $$
  select exists(select 1 from private.payment_expiry_scheduler where singleton and token=p_token)
$$;
revoke all on function public.payment_expiry_authorize(text) from public,anon,authenticated;
grant execute on function public.payment_expiry_authorize(text) to service_role;

create or replace function public.payment_expiry_candidates(p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if p_limit not between 1 and 100 then raise exception 'Invalid expiry batch size'; end if;
  select jsonb_build_object(
    'unstarted',coalesce((select jsonb_agg(o.id order by o.payment_deadline_at,o.id) from (
      select o.id,o.payment_deadline_at from public.orders o
      where o.status='pending_payment' and o.payment_status='pending' and o.payment_deadline_at<=clock_timestamp()
        and not exists(select 1 from public.payments p where p.order_id=o.id)
      order by o.payment_deadline_at,o.id limit p_limit
    ) o),'[]'::jsonb),
    'pending',coalesce((select jsonb_agg(jsonb_build_object(
      'id',p.id,'order_id',p.order_id,'provider',p.provider,'environment',p.environment,
      'provider_reference',p.provider_reference,'amount',p.amount,'currency',p.currency,
      'status',p.status,'payment_url',p.payment_url,'created_at',p.created_at,
      'request_payload',p.request_payload,'payment_deadline_at',o.payment_deadline_at
    ) order by o.payment_deadline_at,p.id) from (
      select p.*,o.payment_deadline_at from public.payments p join public.orders o on o.id=p.order_id
      where p.status='pending' and o.status='pending_payment' and o.payment_status='pending'
        and o.payment_deadline_at<=clock_timestamp()
      order by o.payment_deadline_at,p.id limit p_limit
    ) p join public.orders o on o.id=p.order_id),'[]'::jsonb)
  ) into result;
  return result;
end $$;
revoke all on function public.payment_expiry_candidates(integer) from public,anon,authenticated;
grant execute on function public.payment_expiry_candidates(integer) to service_role;

create or replace function public.expire_unstarted_payment_orders(p_limit integer default 50)
returns integer language plpgsql security definer set search_path='' as $$
declare o public.orders; expired_count integer:=0;
begin
  if p_limit not between 1 and 100 then raise exception 'Invalid expiry batch size'; end if;
  for o in select o.* from public.orders o
    where o.status='pending_payment' and o.payment_status='pending' and o.payment_deadline_at<=clock_timestamp()
      and not exists(select 1 from public.payments p where p.order_id=o.id)
    order by o.payment_deadline_at,o.id limit p_limit for update skip locked loop
    perform private.settle_inventory_for_order(o.id,'expired');
    update public.orders set payment_status='expired',status='cancelled' where id=o.id and payment_status='pending';
    expired_count:=expired_count+1;
  end loop;
  return expired_count;
end $$;
revoke all on function public.expire_unstarted_payment_orders(integer) from public,anon,authenticated;
grant execute on function public.expire_unstarted_payment_orders(integer) to service_role;

-- pg_cron/pg_net are opt-in extensions on Supabase. The schedule is created
-- only after this migration is applied; deployment order requires the
-- payments-expiry Edge Function to be deployed first.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

create or replace function private.payment_expiry_tick()
returns bigint language plpgsql security definer set search_path='' as $$
declare scheduler_token text; request_id bigint;
begin
  select token into scheduler_token from private.payment_expiry_scheduler where singleton;
  select net.http_post(
    url:='https://fcightecxkegtqlaxvjs.supabase.co/functions/v1/payments-expiry',
    headers:=jsonb_build_object('Content-Type','application/json','X-Perfun-Payment-Expiry-Token',scheduler_token),
    body:='{}'::jsonb
  ) into request_id;
  return request_id;
end $$;
revoke all on function private.payment_expiry_tick() from public,anon,authenticated;

do $$ begin
  if exists(select 1 from cron.job where jobname='perfun-payment-expiry-every-minute') then
    perform cron.unschedule(jobid) from cron.job where jobname='perfun-payment-expiry-every-minute';
  end if;
  perform cron.schedule('perfun-payment-expiry-every-minute','* * * * *','select private.payment_expiry_tick()');
end $$;
