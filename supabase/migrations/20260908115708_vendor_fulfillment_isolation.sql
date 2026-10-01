-- A vendor account is fulfillment-only, including when it used to be a customer.
do $$ declare table_name text; begin
 foreach table_name in array array['orders','order_items','payments','addresses','creations','creation_notes'] loop
  execute format('create policy vendor_customer_data_denied on public.%I as restrictive for all to authenticated using ((select exists(select 1 from public.profiles where id=(select auth.uid()) and role<>''vendor''))) with check ((select exists(select 1 from public.profiles where id=(select auth.uid()) and role<>''vendor'')))',table_name);
 end loop;
end $$;
-- The checkout implementation deliberately bypasses RLS for atomic snapshots; guard it explicitly.
do $$ declare definition text; original text := 'not exists(select 1 from public.profiles where id=owner_id)'; begin
 definition:=pg_get_functiondef('private.checkout(uuid,jsonb,uuid,text,boolean)'::regprocedure);
 if position(original in definition)=0 then raise exception 'Unexpected checkout implementation; review vendor guard before applying'; end if;
 execute replace(definition,original,'not exists(select 1 from public.profiles where id=owner_id and role<>''vendor'')');
end $$;
