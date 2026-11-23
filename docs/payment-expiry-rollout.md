# Payment expiry rollout

The 60-minute order deadline is authoritative. The DOKU `payment_due_date` is calculated from `orders.payment_deadline_at` for every create attempt and is never copied into the reservation payload. A provider response whose expiry exceeds the order deadline is rejected.

## Controlled deployment order

1. Pause new payment-session creation at the release gate (keep order creation and existing DOKU sessions available). This is a release control, not an application behavior change.
2. Apply `20261122120000_payment_expiry_scheduler.sql` with the scheduler still disabled. It adds the deadline column, compatible RPCs, the legacy audit snapshot, and `pg_cron`/`pg_net` extensions, but does not create the cron job.
3. Verify the schema and RPC contract on the old function versions. Existing pending orders are listed through `payment_expiry_legacy_audit`; orders with a pending payment retain a deadline at least through the legacy payment attempt's 60-minute session window. Do not approve an order until its DOKU status and session state are reviewed.
4. Deploy `payments-create`, `payments-webhook`, `payments-sync`, and `payments-expiry` from the same commit. Keep JWT contracts unchanged: create/sync require JWT; webhook and expiry use their existing non-JWT entry points with their own verification.
5. Verify all four function versions, shared DOKU configuration, retry behavior, and response contracts. Re-open the release gate only after these checks pass.
6. Approve the audited legacy rows, then call `payment_expiry_legacy_audit`/`approve_payment_expiry_legacy_audit` as the controlled read-only/review workflow requires. Finally call `enable_payment_expiry_scheduler()`; it refuses to schedule while any legacy row is unreviewed.
7. Verify the cron job and observe one cycle without creating a production order. Pending sessions are still checked with DOKU before stock is released; provider uncertainty keeps them pending.

If any step fails, stop before scheduler activation. Never create the cron job manually or skip the legacy audit.

## Rollback

Stop the release gate first, then unschedule `perfun-payment-expiry-every-minute` (if it was activated). Disable or roll back `payments-expiry` only after the scheduler is stopped. Keep order/payment rows, the audit snapshot, and deadlines intact; rollback must use a reviewed database migration and must not delete production orders or release stock outside the existing idempotent settlement path. If only functions were deployed, restore the previous four function versions without applying a database rollback.
