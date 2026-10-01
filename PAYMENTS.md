# Payment integration — DOKU

Implemented 8 September 2026. Existing checkout totals, order snapshots, creation flow and layout are retained. Payment actions are added to order confirmation and Orders. No shipping API, payment collection by the frontend, or dashboards are included.

## Deployment and migrations

Applied to Supabase project `fcightecxkegtqlaxvjs`:

- `20260908092144_payment_layer.sql`: `payments`, private webhook audit/deduplication table, `orders.payment_status`, customer read policies, server-only reservation/session/event RPCs.
- `20260908092504_payment_attempt_ordering.sql`: monotonic attempt sequence for deterministic latest-attempt selection and correct refund timestamps.

`payments` records order, provider/environment/reference, DB-derived amount and currency, status, paid_at, hosted URL, immutable request payload, metadata, created_at/updated_at and attempt sequence. A unique partial index permits only one pending attempt per order. Customer SELECT is restricted to safe columns and their own orders; metadata, request payload and hosted URL are server-only. `private.payment_events` intentionally has no customer RLS policy. Only service-role operations can modify payment state.

Deployed POST endpoints:

- `https://fcightecxkegtqlaxvjs.supabase.co/functions/v1/payments-create`: authenticated owner; accepts `{ "order_id": "UUID" }` only. Locks/revalidates order and derives amount from database. Returns hosted payment URL.
- `https://fcightecxkegtqlaxvjs.supabase.co/functions/v1/payments-sync`: authenticated owner; checks provider status server-side (after the first 60 seconds).
- `https://fcightecxkegtqlaxvjs.supabase.co/functions/v1/payments-webhook`: public entrypoint with DOKU HMAC verification; no Supabase JWT required.

## Manual configuration required

In Supabase **Edge Functions → Secrets**, set these server-side values using `supabase/functions/.env.example` as reference:

| Variable | Value |
| --- | --- |
| `PAYMENT_PROVIDER` | `doku` |
| `PAYMENT_ENVIRONMENT` | `sandbox` initially |
| `DOKU_CLIENT_ID` | Your DOKU sandbox Client ID |
| `DOKU_SECRET_KEY` | Your DOKU sandbox Secret Key |
| `APP_URL` | Actual frontend URL; HTTPS for hosted sites, localhost allowed in sandbox |
| `DOKU_NOTIFICATION_URL` | Exact webhook URL above |
| `PAYMENT_ALLOWED_ORIGINS` | Optional comma-separated additional frontend origins |

Supabase automatically supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to hosted functions. Never add provider secrets or service-role keys to a `VITE_` variable or browser code. No new frontend environment variable is needed.

Enable DOKU Checkout and required payment channels in the sandbox merchant account. Set its notification URL to the exact webhook endpoint above (no trailing slash or query). Signature verification uses this public URL's pathname, including `/functions/v1/payments-webhook`. Return navigation is server-configured as `APP_URL` with `#orders`; a browser return never marks an order paid.

Provider references: [DOKU backend integration](https://developers.doku.com/accept-payments/doku-checkout/integration-guide/backend-integration), [idempotency](https://developers.doku.com/get-started-with-doku-api/idempotency-request), [notification guidance](https://developers.doku.com/get-started-with-doku-api/notification/best-practice), [sandbox simulation](https://developers.doku.com/accept-payments/doku-checkout/integration-guide/simulate-payment-and-notification).

## Status and retry behavior

- New payment: `pending`; successful verified payment: `payments.status=paid`, `orders.payment_status=paid`, `orders.status=pending_payment → paid`.
- Known creation rejection: `failed`. DOKU order-level `ORDER_EXPIRED`: `expired`. Authentic refund: `refunded`. Fulfillment status and historical snapshots are preserved for failure/expiry/refund.
- DOKU Checkout channel-level FAILED/EXPIRED does **not** end the checkout session: customers can change channel. It stays pending until final order expiry or payment success. Card authorization alone is not payment capture.
- Pay Again reuses a pending session; unknown network outcomes retry the same payment ID, invoice and body using DOKU idempotency. A terminal failed/expired attempt may create a new payment attempt, never a new order.
- Webhooks validate raw-body HMAC, client identity, invoice, currency when supplied, and amount. Database transactions deduplicate events and prevent late failures/pending events from regressing paid state. Old signed retries are allowed because DOKU supports delayed/manual notification retries.
- Orders refreshes database status on focus and every 15 seconds while pending. Check payment status explicitly reconciles with DOKU.

## Validation

- Six Node payment tests passed: independent POST/GET signature vectors; webhook replay; altered signature/body/path/client/amount rejection; DOKU status semantics; lost-response retry; invalid provider URL/amount and known rejection.
- Deno type-check passed for all three Edge Functions.
- TypeScript, ESLint and production Vite/PWA build passed.
- Live rollback SQL suites passed: `supabase/tests/payments.sql`, `orders.sql`, `ownership.sql`. These verify RLS, protected metadata/RPCs, payment state replay, stable snapshots, checkout pricing, address ownership, creation rules and order idempotency. Fixtures are rolled back.
- Deployed create/sync endpoints reject unauthenticated calls with HTTP 401.
- Deployed webhook returns HTTP 503 while DOKU secrets are absent. Browser verification was attempted but the local browser automation process did not respond; visual/payment round-trip verification remains outstanding.
- Security advisor reports informational RLS-without-policy for the deliberately server-only private event table.

Run unit tests with Node 24: `npm run test:payments`. SQL tests should run with a privileged connection; each script rolls back. To redeploy functions, use Supabase CLI with this project's `supabase/config.toml` or the connected Supabase deployment tooling.

## Remaining acceptance steps

DOKU credentials have not been provided/configured, so a real sandbox checkout, signed provider notification across the public network, and the complete Pay → DOKU → Paid browser round trip have **not** been verified. Missing credentials deliberately return a configuration error and never simulate a successful payment.

After setting secrets: create a sandbox order, press Pay, complete payment using DOKU's simulator, confirm webhook delivery and Paid in Orders; resend the notification and confirm no duplicate state changes. Also exercise expiry/Pay Again, delayed webhook and a second customer's access denial. Before production, activate the merchant/channels, set production credentials/environment and HTTPS APP_URL, and verify the production hosted-payment URL. Refund initiation, partial-refund accounting, scheduled reconciliation and operations tooling are outside this stage.

## Changed files

- Database/config: both migrations above; `supabase/config.toml`; `supabase/functions/.env.example`.
- Server: `supabase/functions/_shared/{payment-provider,payment-service,doku,runtime}.ts`; `supabase/functions/{payments-create,payments-sync,payments-webhook}/index.ts`.
- Frontend: `src/lib/orders.ts`, `src/lib/payments.ts`, `src/components/PaymentActions.tsx`, `src/components/CheckoutScreens.tsx`, `src/pages/OrdersPage.tsx`, `src/app/App.tsx`, `src/cloud.css`.
- Tests/docs: `tests/payments.test.mjs`, `supabase/tests/payments.sql`, `package.json`, `PAYMENTS.md`.
