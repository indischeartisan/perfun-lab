# Admin Testing Mode: implementation boundary and release blockers

Status: **not implemented, not deployable and not enabled**. The only proposed
backend addition is an admin-only, disabled-by-default **read-only preflight**.
It does not approve, pay, process, pack or ship an order. Its result is not an
authorization to do so, and `workflow_available` is always false. Do not enable
the preflight setting as if it enabled Admin Testing Mode.

## Existing flows audited

- `reserve_payment` locks the order before reserving a payment; provider events
  may arrive later, including for historical failed or expired attempts.
- `payment_status = 'paid'` creates production jobs and can create an assignment
  and shipment. Production and fulfillment guards currently require that status.
- Admin revenue aggregates paid orders. Payout eligibility derives from shipped,
  packed shipments and assignments, not from a separately audited payment.
- A test order marked paid/shipped through the existing path would therefore be
  liable to appear as real revenue and become payable to a vendor.

## Review-only preflight

The new migration is **not applied**. It exposes no payment or workflow action;
the flag only controls preflight and defaults off. The RPC calls the existing
server-side admin check and rejects even historical payment attempts. This
conservative check is informational: concurrent payment creation can invalidate
it immediately, and a future mutation must re-check under the same order lock as
payment reservation. It is not a substitute for that transactional guard.

## Required before implementation can be released

1. Design and review a separately identifiable test lifecycle that does not
   mark actual payment attempts or `orders.payment_status` as real paid, and
   uses only authorized Admin/Vendor identities. Audit each action with actor,
   timestamp, action, target, and idempotency key.
2. Coordinate with payment reservation and late provider events in a single
   transaction and consistent lock order. Reject all order/payment states that
   could collide with a real transaction. Verify with two database sessions.
3. Ensure test work cannot enter real revenue, real vendor payout, customer
   shipping/fulfillment or external carriers, including direct RPC access and
   retries. Provide an unmistakable TEST label on every relevant screen and A6
   document; simulated completion must not mean an actual dispatch.
4. Preserve real Admin/Vendor role checks, assignments, production snapshots,
   Play Set and multi-item handling, packing guards, RLS and legacy orders.
5. Implement the application UI and backend operations, default the complete
   feature off on the server, add idempotency and disablement guarantees, then
   run SQL, concurrency, client and authenticated browser tests.
6. Obtain explicit review and approval before applying any migration to the
   linked database. Validate the existing backup/restore plan first. Deploy
   only after all security checks and CI pass.

The preflight regression suite checks authorization, repeated read checks and
the absence of side effects. It does **not** test duplicate submission, payout
exclusion or end-to-end testing actions because those actions do not yet exist.
