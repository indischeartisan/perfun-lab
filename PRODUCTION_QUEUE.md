# Production Queue

Implemented and applied to Supabase project `fcightecxkegtqlaxvjs` on 8 September 2026. Existing checkout, DOKU payment handling, order snapshots and customer flows are preserved.

## Migrations

- `supabase/migrations/20260908100140_production_queue.sql`: production table, immutable operational snapshots, automatic queue triggers/backfill, staff read policy and validated production action RPC.
- `supabase/migrations/20260908100810_production_rls_initplan.sql`: evaluates the authenticated user lookup once per query in the production read policy.

## Schema and automatic creation

`production_jobs` has `id`, unique `order_item_id`, `status`, nullable `assigned_to`, `started_at`, `completed_at`, `created_at`, `updated_at`. Additional operational fields are `order_number`, `ordered_at`, `quantity`, `product_snapshot`, `formulas_snapshot`, and `production_allowed`.

One job represents one order item, including its full quantity. A bundle has three ordered formulas in the same job; a bundle quantity of two means producing two copies of each bottle/formula. Product label, size and bottle count are copied from `order_items.product_snapshot`; Top/Mid/Base names are copied from `order_items.creations_snapshot`. The projection excludes customer IDs, creation IDs/names, address, prices and arbitrary extra JSON fields. No live Creation or catalog lookup is used to produce the formula.

When the existing payment event RPC updates `orders.payment_status` to `paid`, an AFTER trigger inserts all of that order's item jobs within the **same database transaction**. If queue creation fails, the payment transaction rolls back and its notification can be retried. A unique constraint on `order_item_id` and `ON CONFLICT DO NOTHING` prevent duplicate jobs and preserve existing assignment/timestamps on retry. Another trigger handles server imports of items into an already-paid order. Migration backfill queues previously paid order items using the same rules.

A BEFORE INSERT trigger verifies the parent's paid status and populates the projection; callers cannot fabricate an unpaid job. Production snapshot fields are protected against updates. When payment eligibility changes away from paid, existing jobs remain as history with `production_allowed=false`, and further actions are rejected. No new production status is introduced for this hold.

## Role and authorization

- `perfumer` and `admin`: RLS SELECT on all production jobs. Customer, vendor and anonymous requests cannot read them.
- `perfumer`: can call `advance_production_job(p_job_id, p_action)` with `start` or `complete`. There are no client INSERT, UPDATE or DELETE grants.
- `admin`: read-only production access in this stage. No full admin dashboard.
- The public RPC uses security invoker; its private privileged implementation explicitly checks `auth.uid()` against the current protected `profiles.role`, validates paid eligibility, and locks order then job. Authorization never trusts editable user metadata or a client-supplied assignee.
- Start assigns the calling perfumer and records server time: `queued → in_production`. Only that assigned perfumer can Complete: `in_production → completed`.
- Repeated Start/Complete by the assigned perfumer preserves timestamps. Another perfumer cannot steal or finish the job, and completed jobs cannot be reopened.
- Existing RLS on orders, order_items, payments, addresses, profiles and creations is unchanged. Perfumer access to the queue does not grant access to customer financials, history, credentials or admin settings.

## Using the dashboard

Sign in with a profile whose database role is `perfumer`; click **Production Queue** in the account area, or open `/#production`. The dashboard uses the existing typography, colors, cards and navigation. Tabs show Queued, In Production and Completed, with 25 jobs per page, Refresh, and a visible-page refresh every 15 seconds. Admin uses the same route with read-only cards.

Assign staff roles only through a trusted Supabase SQL Editor/server operation, for example after replacing the placeholder with the intended staff user's UUID:

```sql
update public.profiles set role = 'perfumer' where id = 'STAFF_USER_UUID';
```

No real user has been promoted automatically. Refresh the page after assigning the role. A customer cannot promote themselves. No new environment variables, Edge Functions or webhook/provider settings are needed for this stage.

## Verification

- `supabase/tests/production.sql` passed against the deployed database and rolls back all fixtures. Covers unpaid rejection, real payment-event RPC triggering jobs, exactly one job per item, three-formula bundle snapshots, payment retries, protected snapshots, role isolation, direct write denial, assignment, transition retries, role revocation and refund hold.
- Existing `payments.sql`, `orders.sql`, and `ownership.sql` regression suites passed, covering payment idempotency, historical order data, checkout totals, address isolation and creation rules.
- Two simultaneous authenticated perfumer API requests for one queued fixture job produced exactly one assignment; the winner's retry preserved `started_at`.
- Browser test with disposable accounts and the real Supabase API: paid-event fixture → Queued bundle → Start Production → In Production → Complete → Completed. Database confirmed assignment and start/completion timestamps. Desktop and 390px mobile layouts were inspected; mobile had no horizontal overflow, and no browser runtime errors were reported. Browser used Edge headless after the bundled Chrome process failed to launch.
- Admin browser verification showed queue cards without Start/Complete actions. Anonymous access displayed the access-required page. Customer/vendor rejection was verified by SQL/RLS tests. Disposable users, sessions, orders, payments and jobs were removed after verification.
- TypeScript, ESLint and Vite/PWA production build passed.
- Advisors: no new security or performance warnings. Informational findings remain for the intentionally server-only private payment-event table without customer policies and low-usage indexes. See [RLS policy guidance](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) and [unused-index guidance](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).

## Changed files

- Both migrations above.
- `src/lib/production.ts`: paginated staff reads and production action RPC client.
- `src/pages/ProductionPage.tsx`: queue, snapshots, assignment and actions.
- `src/hooks/useAuth.ts`: reads the current user's database profile role.
- `src/app/App.tsx`, `src/types/index.ts`: staff navigation and protected production route.
- `src/cloud.css`: scoped production styling.
- `supabase/tests/production.sql`: database integration/authorization tests.
- `PRODUCTION_QUEUE.md`: setup and test report.

## Remaining scope and limitations

The full external DOKU sandbox payment round trip still needs provider credentials/configuration and acceptance testing described in `PAYMENTS.md`. Production was tested from the actual payment-event database API using an explicitly simulated paid fixture, not a charge to DOKU.

No shipping API, vendor dashboard, full admin dashboard, reassignment, cancellation UI or production notification service was added. Production completion updates the job only; it does not mark an order shipped/delivered or change payment history. Refunded/on-hold jobs retain their current production status and require operational review outside this dashboard.
