# Payment expiry rollout

The 60-minute order deadline is authoritative. The DOKU `payment_due_date` is calculated from `orders.payment_deadline_at` for every create attempt and is never copied into the reservation payload. A provider response whose expiry exceeds the order deadline is rejected.

## Controlled deployment order

1. Build and deploy `payments-create`, `payments-webhook`, `payments-sync`, and `payments-expiry` from the same commit. Keep the existing JWT contracts: create/sync require JWT; webhook and expiry use their existing non-JWT entry points with their own verification.
2. Verify the four function versions, shared DOKU configuration, and the payment response contract while the scheduler is still absent.
3. Apply `20261122120000_payment_expiry_scheduler.sql`. The migration adds the deadline contract first and creates the one-minute `pg_cron`/`pg_net` schedule last, so the scheduler is not active until all four compatible functions are deployed.
4. Read-only verify the migration, cron job, deadline column, payment RPCs, and function health. Observe one scheduler cycle without creating a production order.

If any function or contract check fails, stop before step 3. Do not enable the cron job manually.

## Rollback

Unschedule `perfun-payment-expiry-every-minute` first. Then disable or roll back `payments-expiry` only after the scheduler is stopped. Keep order/payment rows and deadlines intact; rollback must use a reviewed database migration and must not delete production orders or release stock outside the existing idempotent settlement path.
