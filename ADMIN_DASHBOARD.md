# Admin Dashboard MVP

Implemented 8 September 2026. Open **Admin Dashboard** after signing in as an admin, or open `/#admin`. The existing customer, DOKU payment, production and fulfillment flows remain in place.

## Database migration

`supabase/migrations/20260908125938_admin_dashboard_mvp.sql` has been applied to Supabase project `fcightecxkegtqlaxvjs`.

No new business tables. Added:

- `notes.version` and `products.version`: optimistic edit conflict detection.
- `note_phases.enabled`: disable a phase without deleting the row referenced by existing Creations.
- `orders_admin_created_idx`: supports order date access as volume grows.
- Admin RPCs, phase selection validation trigger, and disabled-phase validation in checkout.

## Permissions and RPCs

All six public RPCs are invoker wrappers around private definer functions with an empty `search_path`. Each operation checks the current protected `profiles.role = 'admin'`, using the authenticated user ID. User metadata is not trusted. Anonymous execution is revoked. Authenticated non-admins receive `42501`.

| RPC | Purpose |
| --- | --- |
| `admin_overview()` | Current operational counts and paid revenue totals |
| `admin_orders(p_search,p_payment,p_production,p_shipment,p_page)` | Search order number/customer name/email; filter statuses; 25 rows per page |
| `admin_customers(p_search,p_page)` | Customer name/email/order count/last order; 25 rows per page |
| `admin_catalog()` | Read active and inactive notes/products with current versions and prices |
| `admin_save_note(p_id,p_version,p_active,p_category,p_descriptor,p_phases)` | Update note metadata and three phase settings atomically |
| `admin_save_product(p_id,p_version,p_active,p_regular_price,p_sale_price)` | Update availability and regular/optional sale price atomically |

Catalog tables retain their public read policies and do not grant browser users direct insert/update/delete access. Existing customer ownership RLS is preserved. Admin cross-customer data is exposed only through the limited RPC projections, rather than broad table access. Customers output only ID, name, email, total orders, last order. Orders do not expose payment metadata/secrets or saved Creation history.

Production uses the existing admin read policy and has no Start/Complete controls. Fulfillment reuses the existing authorized shipment dashboard and `fulfill_shipment` RPC; admin can update courier/service/tracking, ship and deliver under its existing lifecycle checks. Admin does not gain direct payment or order mutation permissions.

## Catalog behavior

Regular and sale prices must be positive integer rupiah; sale cannot exceed regular. Empty sale removes the launch price. A stale version returns a conflict and requires reloading before editing. Active notes require at least one allowed phase; Soapy must retain all three phase options, with the existing one-Soapy-per-Creation rule unchanged.

Assets remain under `/public`; the editor displays their path and does not move or replace them. Disabled phase rows remain present so saved formulas stay readable, but new selections and checkout reject disabled phases/inactive notes. Inactive products cannot be checked out. Builder and saved-Creation product selection read current availability. Unavailable product drafts in the local bag are hidden and retained until reactivated. Catalog refreshes after a successful admin save and when the browser window regains focus.

Catalog edits do not update `orders`, `order_items`, production formulas, or shipment snapshots. Existing order totals remain payable at the original amount. Stock, shipping rates, provider settings, role management, and catalog creation/deletion are outside this MVP.

## Overview and revenue definitions

- Orders today: midnight-to-midnight Asia/Jakarta (WIB).
- Other counters: current state across all orders/jobs/shipments. Pending payment counts orders still in `pending_payment`, including retryable failed/expired payment attempts. Production counters count jobs, not bottles.
- Paid gross sales: sum of `orders.subtotal` where `payment_status = 'paid'`.
- Discounts: sum of `orders.discount` for those same orders.
- Shipping collected: sum of their immutable `orders.shipping`.
- Net transaction total: sum of `orders.grand_total` = gross − discounts + shipping.
- Refunded orders are excluded entirely. These are transaction totals, not accounting profit; payment provider fees are not deducted. Multiple payment attempts cannot double-count an order.

Operational views refresh every 30 seconds while visible and have a manual Refresh action. Catalog forms use explicit reload to avoid overwriting unsaved edits. No advanced charts or analytics added.

## Setup

No new environment variables, Edge Functions, secrets or provider settings are needed. Continue using `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. No service role key is sent to the browser.

Assign the intended operator once from a trusted SQL session, using the correct existing Auth user ID:

```sql
update public.profiles set role = 'admin' where id = '<operator-auth-user-uuid>';
```

Refresh/sign in again, then open Admin Dashboard. No real customer account was automatically promoted. Deploy the updated frontend build to your existing host; the database migration is already applied.

## Changed files

- `supabase/migrations/20260908125938_admin_dashboard_mvp.sql`
- `supabase/tests/admin.sql`
- `supabase/tests/ownership.sql` — accepts the earlier phase-validation constraint error as well as the previous FK error.
- `src/lib/admin.ts`
- `src/hooks/useAdminData.ts`
- `src/pages/AdminPage.tsx`
- `src/components/AdminCatalogPanel.tsx`
- `src/admin.css`
- `src/app/App.tsx`
- `src/types/index.ts`
- `src/lib/catalog.ts`
- `src/hooks/useCart.ts`
- `src/components/CreationOrderPicker.tsx`
- `src/components/Builder.tsx`
- `ADMIN_DASHBOARD.md`

## Verification

- TypeScript, ESLint and production build passed.
- All six database rollback suites passed: ownership, orders, payments, production, shipping, admin.
- Admin suite covers unauthorized roles/forged metadata, revoked role, restricted direct writes, search/filter/pagination, minimal customer output, invalid/stale pricing edits, note phases/Soapy, historical snapshots, paid-only revenue and payment retry handling.
- Six existing DOKU unit tests passed.
- Browser with disposable accounts: guest/customer denied; admin tabs load from Supabase; order search and customer data render; note and product forms save existing values; production remains read-only; fulfillment loads; revenue matches the fixture (258000 − 40000 = 218000).
- Desktop and 390px mobile layouts checked; no horizontal overflow or application errors during the admin happy path. Customer account switching removes the admin dashboard and its RPC is denied with `42501`.
- Test sessions/accounts/orders are removed afterward. SQL suites roll back all catalog edits. Browser saves submitted existing catalog values only (version counters advance).

## Remaining items

- Assign the real admin operator and deploy the frontend.
- Complete real DOKU sandbox/provider setup and external payment E2E from the previous stage; these were not exercised with real payment credentials in this admin task.
- No external shipping-rate, booking, tracking, accounting, inventory or advanced analytics integration.
- Supabase Advisor reports Auth leaked-password protection disabled: [configuration guide](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). This is an Auth setting, not an admin authorization bypass.
- Advisor INFO: `private.payment_events` intentionally has no client RLS policy (server-only webhook ledger): [explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
- Advisor INFO: the newly created order index is not yet used at current small data volume: [explanation](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index). Reassess against real workload as order volume grows.
