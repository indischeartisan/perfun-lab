-- Phase 5B.3: server-side Rp5.000 shipping promotion. Shipping remains disabled by default.
alter table private.shipping_quotes
  add column if not exists original_shipping_amount bigint,
  add column if not exists shipping_discount bigint not null default 0 check(shipping_discount >= 0),
  add column if not exists customer_shipping_total bigint,
  add column if not exists promotion_subsidy bigint not null default 0 check(promotion_subsidy >= 0);

-- Existing quote rows predate the promotion. Preserve their historical amount.
update private.shipping_quotes
set original_shipping_amount=coalesce(original_shipping_amount,amount),
    shipping_discount=least(coalesce(original_shipping_amount,amount),5000),
    customer_shipping_total=coalesce(original_shipping_amount,amount)-least(coalesce(original_shipping_amount,amount),5000),
    promotion_subsidy=least(coalesce(original_shipping_amount,amount),5000),
    amount=coalesce(original_shipping_amount,amount)-least(coalesce(original_shipping_amount,amount),5000)
where original_shipping_amount is null or customer_shipping_total is null;
alter table private.shipping_quotes
  alter column original_shipping_amount set not null,
  alter column customer_shipping_total set not null,
  add constraint shipping_quotes_voucher_math check(
    original_shipping_amount > 0
    and shipping_discount = least(original_shipping_amount,5000)
    and customer_shipping_total = original_shipping_amount-shipping_discount
    and promotion_subsidy = shipping_discount
    and amount = customer_shipping_total
  );

-- The checkout function already uses shipment.amount. Redefine quote creation so
-- it stores the customer total there while preserving the provider cost separately.
create or replace function private.create_shipping_quote(
  p_user_id uuid,p_address_id uuid,p_items jsonb,p_courier_code text,p_courier_name text,p_service text,p_amount bigint,p_etd text,
  p_routing_version text,p_origin_region text,p_destination_region text
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare context jsonb; weight jsonb; address public.addresses; quote private.shipping_quotes; voucher bigint;
begin
 context:=private.shipping_quote_context(p_user_id,p_address_id); weight:=private.shipping_weight_for_items(p_items);
 if p_courier_code not in ('jnt','anteraja') or length(btrim(coalesce(p_courier_name,''))) not between 1 and 100 or length(btrim(coalesce(p_service,''))) not between 1 and 100 or p_amount is null or p_amount<=0 or length(coalesce(p_etd,''))>100 then raise exception 'Invalid provider shipping quote' using errcode='23514'; end if;
 if p_routing_version<>'indonesia-province-v1' or p_origin_region not in ('java','outside-java') or p_destination_region not in ('java','outside-java') or (p_origin_region=p_destination_region and p_courier_code<>'jnt') or (p_origin_region<>p_destination_region and p_courier_code<>'anteraja') then raise exception 'Invalid automatic shipping route' using errcode='23514'; end if;
 voucher:=least(p_amount,5000);
 select * into address from public.addresses where id=p_address_id and user_id=p_user_id for share;
 insert into private.shipping_quotes(user_id,address_id,address_fingerprint,items_fingerprint,origin_version,package_profile_version,origin_destination_id,destination_id,destination_label,weight_grams,courier_code,courier_name,service,amount,original_shipping_amount,shipping_discount,customer_shipping_total,promotion_subsidy,etd,routing_version,origin_region,destination_region,expires_at)
 values(p_user_id,p_address_id,private.shipping_digest(to_jsonb(address)),private.shipping_digest(p_items),(context->>'origin_version')::integer,(weight->>'package_profile_version')::integer,(context->>'origin_destination_id')::bigint,(context->'address'->>'destination_id')::bigint,context->'address'->'destination_label',(weight->>'weight_grams')::integer,p_courier_code,btrim(p_courier_name),btrim(p_service),p_amount-voucher,p_amount,voucher,p_amount-voucher,voucher,coalesce(p_etd,''),p_routing_version,p_origin_region,p_destination_region,clock_timestamp()+interval '10 minutes') returning * into quote;
 return jsonb_build_object('quote_id',quote.id,'courier_code',quote.courier_code,'courier_name',quote.courier_name,'service',quote.service,'amount',quote.amount,'original_shipping_amount',quote.original_shipping_amount,'shipping_discount',quote.shipping_discount,'customer_shipping_total',quote.customer_shipping_total,'promotion_subsidy',quote.promotion_subsidy,'etd',quote.etd,'weight_grams',quote.weight_grams,'origin_version',quote.origin_version,'package_profile_version',quote.package_profile_version,'expires_at',quote.expires_at);
end $$;

-- Persist promotion accounting in the immutable order snapshot without changing
-- existing order table pricing columns or old-order reads.
create or replace function private.snapshot_shipping_voucher() returns trigger language plpgsql security definer set search_path='' as $$
declare quote private.shipping_quotes;
begin
 if new.shipping_quote_snapshot ? 'quote_id' then
  select * into quote from private.shipping_quotes where id=(new.shipping_quote_snapshot->>'quote_id')::uuid;
  if found then
   new.shipping:=quote.customer_shipping_total;
   new.grand_total:=new.subtotal-new.discount+new.shipping;
   new.shipping_quote_snapshot:=new.shipping_quote_snapshot || jsonb_build_object('original_shipping_cost',quote.original_shipping_amount,'shipping_discount',quote.shipping_discount,'customer_shipping_total',quote.customer_shipping_total,'promotion_subsidy',quote.promotion_subsidy,'routing_version',quote.routing_version,'origin_region',quote.origin_region,'destination_region',quote.destination_region);
  end if;
 end if;
 return new;
end $$;
drop trigger if exists orders_snapshot_shipping_voucher on public.orders;
create trigger orders_snapshot_shipping_voucher before insert on public.orders for each row execute function private.snapshot_shipping_voucher();
revoke all on function private.snapshot_shipping_voucher() from public,anon,authenticated;
