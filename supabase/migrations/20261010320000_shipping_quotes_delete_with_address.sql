-- A shipping quote is an ephemeral checkout artifact. Orders retain immutable
-- address and shipping snapshots, so removing a saved address must not be
-- blocked by an expired or consumed quote that references it.
alter table private.shipping_quotes
  drop constraint shipping_quotes_address_id_fkey;

alter table private.shipping_quotes
  add constraint shipping_quotes_address_id_fkey
  foreign key (address_id) references public.addresses(id) on delete cascade;
