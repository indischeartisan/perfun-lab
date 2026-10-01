# Checkout & Orders — implementation report

Implemented on the existing Supabase project `fcightecxkegtqlaxvjs`.

## Flow

My Creations → Order this Creation → select 10 ml, 30 ml or bundle 3 × 10 ml → choose saved creations and quantity → checkout → select/add/edit a saved address → review server quote → create order → confirmation → Orders.

The existing typography, bottle builder, navigation and checkout/confirmation styles are preserved. The previous device-only test order flow is replaced by authenticated Supabase orders. The builder's local Bag remains a preview; checkout purchases are selected from saved Creations.

## Migrations (already applied)

- `supabase/migrations/20260908060230_checkout_orders.sql`: existing address compatibility, owner-only address policies, address-save RPC, orders/items, RLS, quote and order transaction.
- `supabase/migrations/20260908060859_checkout_creation_lookup.sql`: corrects the creation lookup variable in the checkout function. Both migrations must be applied in order on another project, after the previous auth/catalog/creations migration. Local timestamps match the remote migration history.

No new environment variables or service role key are required. Keep the existing `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. The `private` schema must remain unexposed to the Data API.

## Schema

`addresses` reuses the existing table and data, or creates it on a fresh project. Fields: UUID, owner, recipient name, phone, address line, city/regency, province, postal code, label, default flag and timestamps. Existing optional district and delivery-note fields remain intact. The first address becomes default; a partial unique index permits at most one default per customer. A profile-row lock serializes default switching. Deleting a default address leaves remaining addresses available for manual selection or setting a new default.

`orders`: UUID, unique order number, owner, idempotency request ID and original request payload, status, address snapshot, subtotal, discount, shipping, grand total, currency and creation timestamp. Initial status is `pending_payment`. `(user_id, request_id)` is unique. There are no references from the historical snapshot to a mutable address or creation.

`order_items`: UUID, parent order, line position, product snapshot (including bottle size/count), creations snapshot (including names, phases and full note data), quantity, normal unit price, effective unit price and line total. Snapshots do not join live source data when displayed.

Orders and items grant customers SELECT only, restricted to their own orders by RLS. Client inserts, updates and deletes are denied. The authenticated RPC invokes a private, restricted database function which validates ownership of all creations/address and reads product prices on the server before writing both tables in one transaction. It sets status and snapshots internally. No authorization depends on editable user metadata.

## Prices and totals

- 10 ml: normal Rp129,000, launch Rp109,000.
- 30 ml: normal Rp229,000, launch Rp199,000.
- Bundle 3 × 10 ml: Rp299,000 for three distinct saved creations. Quantity counts complete bundles.
- Subtotal = normal unit price × quantity, summed over order lines.
- Discount = normal minus effective launch price × quantity. No coupons in this stage.
- Shipping = Rp0 placeholder.
- Grand total = subtotal − discount + shipping.

`quote_order` returns server-computed snapshots and totals. `place_order` recalculates and compares a quote fingerprint. Changes to relevant source data between review and submission require a fresh review. Prices, status and snapshot fields supplied by a browser are never trusted. Quantities must be integers 1–99 and each order supports at most 50 lines at the API level; the current UI purchases one selected product configuration per checkout.

## Duplicate submission and recovery

The UI locks submission immediately and saves an intent in `sessionStorage` before sending. Transport errors retain its UUID; reloading checkout restores a Check / retry action. Database advisory locking and the unique owner/request constraint ensure concurrent requests with the same ID return the same order. A reused ID with different items/address is rejected. Retrying a completed request still returns the original order even if source records or prices have changed or been deleted. A genuinely new checkout uses a new ID.

The checkout draft in localStorage contains only owner and product/creation IDs plus quantities, not address or order snapshots. Pending request recovery is retained in the same browser tab via sessionStorage. Orders themselves are stored permanently in Supabase and can be reopened from another device.

## Files changed

- `src/app/App.tsx`: authenticated checkout flow, draft recovery, confirmation and database Orders.
- `src/pages/MyCreationsPage.tsx`: order action and product selection.
- `src/components/CreationOrderPicker.tsx`: single/bundle selection and quantity.
- `src/components/AddressBook.tsx`: address CRUD, default selection, shared address display.
- `src/components/CheckoutScreens.tsx`: live address/review/submit flow, totals, snapshots and confirmation.
- `src/pages/OrdersPage.tsx`: owner-only order history and delivery details.
- `src/lib/orders.ts`: typed address/order data and Supabase operations.
- `src/types/index.ts`: checkout and confirmation views.
- `src/cloud.css`: scoped styles for address cards, product picker and order history.
- `supabase/tests/orders.sql`: rollback-only SQL integration/security checks.
- The two migrations above, this document and documentation updates in README / SUPABASE_SETUP.

## Verification

- TypeScript, ESLint and production Vite/PWA build passed.
- SQL tests verified address creation/edit/default switching/deletion, all three products, quantities and totals, invalid bundle/quantity rejection, pending-payment status, immutable snapshots after source edits/deletions, cross-owner and anonymous rejection, price tamper rejection, stale quote rejection and retry after source deletion. All fixtures rolled back.
- Real browser session with a disposable account verified My Creations → three-creation bundle → add/edit address → review Rp299,000 → create → confirmation → Orders → reload.
- Two parallel API submissions with the same request ID returned one identical order ID.
- A simulated lost response after a successful commit produced the pending recovery state; reload → retry returned the saved Rp109,000 order without a duplicate.
- Mobile 390 px and desktop 1440 px layouts were inspected. No unexpected browser JavaScript errors were found.
- Deleting the saved address through the UI left historical orders intact. Sign-out hid the private order list. All disposable browser-test orders, creations, addresses and the test account were removed after sign-out.

## Remaining work

- Payment gateway/webhooks are intentionally absent; pending orders do not charge customers or automatically become paid.
- Shipping API, delivery rates and fulfillment dashboards are intentionally absent. Shipping is Rp0.
- Google OAuth setup from the prior stage is still required if the provider has not been configured. Tests used a temporary Supabase email/password account, without sending email; they do not verify Google's consent screen.
- Security Advisor found no schema/RLS issue; it currently reports that leaked-password protection is disabled in Auth. See [Supabase's password security settings](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No authentication setting was changed in this stage.
- Order cancellation/payment processing, pagination and multi-product cart checkout are later work; the current customer order history is read-only and the current UI checks out one product configuration at a time.
