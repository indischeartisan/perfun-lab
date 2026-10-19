# Simple Operations integration audit

This branch starts from main, not the simulator branch. Its UI uses the existing authenticated loaders and RPC handlers; it does not import the simulator or alter production database objects. The descriptions below are based on repository source and migrations, not an inspection of deployed database state.

## Existing backend

- The webhook verifies the provider notification, payment reference and amount before applying it. `apply_payment_event` locks the order and deduplicates provider/environment/event keys; paid status creates production jobs with one unique `order_item_id` each. Refund/payment changes can put jobs on hold.
- A configured default vendor is assigned on the paid transition. Assignment is unique by order, preserves a fee snapshot, and requires the profile role to be vendor. Missing or stale default configuration leaves an order unassigned. The schema checks role; this audit has not established a separate active-account flag.
- Automatic assignment invokes the fee snapshot and assignment helper in the payment transaction. Errors other than the explicit missing/stale-default cases may abort that transaction. Exception reporting and error isolation need a separately reviewed design and regression coverage before changing this behavior.
- Job transitions use `advance_production_job`; order readiness for shipping is determined by the server only after every item has a completed job. Production snapshots contain formula arrays per item, but the production query paginates individual jobs and does not provide a complete order aggregate or customer name.
- The shipment guard requires packed status, actual cost and payer before dispatch; payout eligibility also depends on those fields. Historical shipments may have `legacy_unknown` packing. Removing the checklist without replacing these server invariants would break shipment and payout behavior.
- The shipment snapshot contains a province string, but there is no verified canonical province enum or service catalog in this UI. Customer shipping selections, when present, are locked unless an Admin uses the existing audited override. Do not silently replace those values with a Java/non-Java rule.
- Admin order projections do not expose formula or address details; no fabricated detail screen or payment-approval action is added.

## Implemented UI scope

- Admin navigation groups existing screens under Dashboard, Orders, Operations and More. Operations contains the existing production, fulfillment and assignment panels. Recent orders use the existing admin orders RPC.
- Vendor work navigation exposes job queues, shipping, shipped/delivered history, completed-job history and payouts using existing role-scoped data and handlers. A job start changes the active UI tab only after the original server RPC succeeds.
- Compact shared presentational components show existing item sizes and each formula snapshot. Production jobs remain separate per item, not misleadingly grouped across paginated results.
- Shipping confirmation was added before the existing dispatch RPC. Packing, payer, cost, shipping overrides and print/copy actions remain intact.

## Work required before full Simple Operations parity

1. Design an authorized, paginated order-level vendor projection with all jobs and item/formula snapshots; define atomic or per-job actions for partially completed orders. Add RLS, multi-item, Play Set, pagination and concurrency regression tests. Do not infer complete order status from a single job page.
2. Design a server-side packing replacement with explicit auditability, legacy handling and unchanged payout guarantees; test before removing the existing checklist. Define canonical province mapping and an approved operational service catalog, including what happens for missing/legacy provinces and existing customer-selected shipping services.
3. Review transaction-safe assignment failure handling, concurrent events, duplicate webhooks, stale or revoked vendor roles, and fee-snapshot errors. Add explicit exception observability without fabricating paid status or weakening payment validation.
4. Perform authenticated Admin and Vendor browser review and actual A6 print review using authorized test data. No authenticated browser parity is claimed by this branch.

No migration is included or applied. Any future schema/RPC changes must be isolated in their own commits, tested locally and in CI, and approved before production application.
