# Shipping & Vendor Fulfillment

Implemented on 8 September 2026 for Supabase project `fcightecxkegtqlaxvjs`. Existing checkout, payment and production flows remain; fulfillment adds a manual shipment lifecycle without an external shipping API.

## Applied migrations

- `20260908115017_shipping_fulfillment.sql`: shipment schema, snapshot protection, production/order triggers, backfill, RLS and validated fulfillment RPC.
- `20260908115708_vendor_fulfillment_isolation.sql`: restrictive policies block vendor access to customer records, including records owned before a role change; adds a vendor guard to the privileged checkout implementation.

## Shipment lifecycle

One `shipments` row per order is enforced by a unique `order_id`. The table has `id`, `order_id`, `status`, `courier`, `service`, `shipping_cost`, `tracking_number`, `shipped_at`, `delivered_at`, `created_at`, `updated_at`. Operational fields include `order_number`, `ordered_at`, `address_snapshot`, `items_snapshot`, and `fulfillment_allowed`. `provider='manual'` and nullable `provider_reference` leave space for a future server-side provider adapter; no provider API or credentials are used now.

1. **Pending:** created automatically as paid orders enter production. Unpaid orders cannot create a shipment. Backfill includes existing paid orders with order items.
2. **Ready to Ship:** every order item must have a production job, every job must be Completed, the order must remain paid, and it must not be cancelled. A missing job does not count as completion. The last completion triggers readiness in the same transaction.
3. **Shipped:** vendor/admin supplies courier, service and tracking number, then marks shipped. The server rechecks readiness and records `shipped_at`; `orders.status` becomes `shipped`.
4. **Delivered:** vendor/admin manually marks a shipped shipment delivered. The server records `delivered_at`; `orders.status` becomes `completed`.

Shipping details can be saved before dispatch without changing status. Required fields and lengths are validated server-side. Order and shipment locks serialize concurrent actions. Identical retries return the existing shipment and preserve timestamps; conflicting retries cannot rewrite dispatched tracking details. Delivered is final.

Refund/cancellation before dispatch returns the shipment to Pending and prevents dispatch. Already shipped/delivered records retain their shipment history; physical delivery can still be recorded after dispatch. There is no automatic courier tracking synchronization or claim that a courier confirmed delivery.

`shipping_cost` copies the shipping amount charged in the order (currently zero). It is not a newly calculated carrier fee, and fulfillment never changes checkout subtotal, discount, shipping or grand total.

## Historical snapshots

The shipment copies whitelisted recipient name, phone, street, district, city, province, postal code and delivery note from `orders.address_snapshot`. It never reads a customer's saved address for fulfillment. Product label, volume, bottle count and quantity come from `order_items.product_snapshot`/quantity.

Shipment snapshots and the original shipping cost cannot be updated. Editing or deleting a saved address does not alter shipment delivery details. The vendor projection excludes customer account IDs, Creation IDs/formulas, item prices, payment details, order totals and arbitrary extra snapshot fields. One shipment contains every order item; bundles remain three bottles per unit of bundle quantity. Split shipments are outside this stage.

## RLS and vendor access

- Vendor/admin can read the fulfillment projection and call `fulfill_shipment` for `save`, `ship` and `deliver`.
- Customer can read only shipments belonging to their own orders and cannot insert/update/delete or call fulfillment actions.
- Perfumer has no staff-level shipment access. Anonymous users have no table/RPC access.
- All client mutation grants on shipments are revoked. A public security-invoker wrapper calls the private implementation, which checks the current protected `profiles.role`, `auth.uid()`, readiness and valid transitions. Role/assignee/provider data from client metadata is never trusted.
- Vendor is fulfillment-only: restrictive RLS denies orders, order_items, payments, addresses, creations and creation_notes, even if that vendor previously owned the customer records. Privileged checkout explicitly rejects vendor. The payment create/sync endpoints also reject vendor with HTTP 403.
- Vendor navigation shows fulfillment only. Existing customer and perfumer navigation is retained. Admin can use the same fulfillment page; no full admin dashboard is added.
- This stage gives all vendor-role accounts access to the fulfillment queue. There is no per-vendor assignment or tenant partitioning yet.

## Manual setup and use

No new environment variables or shipping-provider settings are required. Use a trusted SQL Editor/server process to give the intended staff account the `vendor` role (replace the placeholder UUID):

```sql
update public.profiles set role='vendor' where id='VENDOR_USER_UUID';
```

No real account was promoted automatically. Refresh after assigning the role. Vendor is routed to the Shipping Queue automatically; vendor/admin can also use **Vendor Fulfillment** or `/#fulfillment`. The queue defaults to Ready to Ship, with Shipped, Delivered and Pending tabs, 25 records per page and refresh every 15 seconds while visible.

The existing `payments-create` and `payments-sync` Edge Functions were redeployed with the vendor role guard. No new Edge Function was necessary and the DOKU webhook behavior is unchanged.

## Validation

- `supabase/tests/shipping.sql` passed: automatic Pending/readiness, missing/incomplete jobs, bundle quantities, saved-address edits/deletion, immutable snapshots and cost, vendor/admin access, owner isolation, direct-write denial, invalid/early shipping, manual delivery, retries, refund/cancellation before dispatch and role revocation. It also verifies a former customer promoted to vendor cannot read their old records or use checkout to bypass RLS.
- Existing production, payment, order and ownership SQL suites passed after adding shipment triggers.
- Browser with disposable accounts and real Supabase API: completed production fixture → Ready to Ship → save courier/service/tracking → Mark as Shipped → customer Orders shows Shipped and tracking → vendor Mark as Delivered → customer Orders shows Delivered.
- Vendor saw the checkout address after its saved address was deliberately changed. Desktop/mobile layouts were inspected; 390px vendor viewport had no horizontal overflow. No browser runtime errors were reported.
- Two concurrent retry requests preserved the same shipment and dispatch timestamps. Deployed payment create/sync endpoints returned HTTP 403 for the vendor fixture.
- TypeScript, ESLint, production Vite/PWA build and all six payment adapter tests passed. No shipping API was called and no parcel was booked during testing.

SQL suites use rollback fixtures. Browser fixtures, sessions, orders, shipments, jobs and payments were removed after verification; the fixture-user count returned zero. Payment was simulated through the existing payment-event database API; this does not constitute a live DOKU payment test.

## Changed files

- Both migrations listed above.
- `src/lib/shipments.ts`: fulfillment types, paginated reads and action client.
- `src/pages/FulfillmentPage.tsx`: vendor/admin queue, delivery snapshot and manual shipment actions.
- `src/components/ShipmentStatus.tsx`: customer/vendor shipment details.
- `src/lib/orders.ts`, `src/pages/OrdersPage.tsx`: owner shipment relation, status/courier/tracking and refresh through delivery.
- `src/app/App.tsx`, `src/types/index.ts`, `src/components/Header.tsx`: fulfillment route, vendor-only navigation and hash navigation handling.
- `src/cloud.css`: scoped fulfillment form/card styles.
- `supabase/functions/_shared/runtime.ts`: denies vendor on customer payment endpoints.
- `supabase/tests/shipping.sql`: database integration/security tests.
- `SHIPPING_FULFILLMENT.md`: setup and completion report.

## Remaining work

Carrier booking/rates, label generation, automatic tracking updates, returns, tracking corrections after dispatch, split shipments and per-vendor assignment are not implemented. Delivered is a manual staff assertion. Provider credentials and live DOKU acceptance testing remain as documented in `PAYMENTS.md`. There is no full admin dashboard, analytics, inventory system or complex automation.

The existing informational advisor finding for the intentionally server-only `private.payment_events` table remains; it has no customer policy by design. See [Supabase RLS advisor guidance](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy). The latest performance advisor check returned no findings.
