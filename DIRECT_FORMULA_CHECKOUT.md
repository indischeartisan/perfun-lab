# Direct formula checkout — 9 September 2026

Current flow: Build → Bag → Google sign-in if needed → address → review → create order → payment → production → fulfillment. Saving a Creation is no longer part of the UI or backend.

Applied migration: `supabase/migrations/20260909074016_direct_formula_checkout.sql`.

- Replaced the private checkout implementation; public `quote_order`/`place_order` signatures are unchanged.
- Each item now accepts `formulas: [{top: noteId, middle: noteId, base: noteId}]` instead of `creation_ids`.
- Exactly one formula for 10ml/30ml, exactly three for a bundle. A bundle may contain repeated formulas, as the Bag allowed before this change.
- Server checks authentication, vendor exclusion, address ownership, active products, current DB pricing, quantity, exactly three valid phase selections per formula, active/enabled notes, and distinct note IDs (Soapy at most once).
- Product, note and address snapshots are generated on the server. Browser names/prices/status fields cannot set those snapshots or totals.
- Existing quote fingerprint, request lock, unique request ID and retry recovery remain. A changed formula/address/price requires a fresh review. A committed legacy request can still be retried with its exact old payload because lookup runs before new-input validation.
- The historical JSON field name `order_items.creations_snapshot` remains for compatibility. It contains independent formula snapshots and has no foreign key or dependency on a Creation table. Payment, production, fulfillment and admin continue reading the same snapshots.
- Dropped `public.creations`, `public.creation_notes`, `public.save_creation`, and the two Creation validation functions. Tables were verified empty before deployment; the migration locks them and aborts if any records appear before deletion. No order or account data is deleted by the migration.

Removed files: `src/pages/MyCreationsPage.tsx`, `src/components/SaveCreation.tsx`, `src/components/CreationOrderPicker.tsx`, `src/lib/creations.ts`.

Updated files: `src/lib/bagCheckout.ts`, `src/lib/orders.ts`, `src/app/App.tsx`, `src/components/CheckoutScreens.tsx`, `src/types/index.ts`, `src/cloud.css`, database test suites and this documentation. Historical migrations remain so new environments can replay the complete migration history.

No new env, secret, provider configuration or service role key in the browser. Existing public RPC wrapper grants and customer ownership RLS remain unchanged.

Verification: TypeScript, ESLint and production build passed. All seven database rollback suites passed with the migration: ownership, orders, payments, production, shipping, admin and direct_formulas. They cover malformed/missing/wrong-phase notes, all Soapy phases, duplicate Soapy rejection, bundle sizes, server-only prices, stale quote rejection, duplicate/conflicting requests, snapshots, paid production, fulfillment and role isolation.

Existing browser checkout drafts containing `creation_ids` must return to Bag and be reviewed again unless their order already committed. No provider payment was charged during verification. Google/DOKU and operations use the existing configuration; real DOKU acceptance testing is still a separate setup item.

Supabase Advisor has no new schema/RLS findings. Existing notices: [Auth leaked-password protection disabled](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), and [private payment event ledger intentionally has no client RLS policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

Browser acceptance passed: Bag single + bundle -> address -> review Rp517000 -> Create Order -> confirmation -> Orders. Database confirmed exactly one pending-payment order with two item snapshots (one formula and three formulas respectively). Bag cleared; no application errors. Test account/session/address/order were removed after sign-out.
