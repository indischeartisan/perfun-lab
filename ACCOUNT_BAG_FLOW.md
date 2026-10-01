Current update: Creation backend dependencies have now been removed. See [DIRECT_FORMULA_CHECKOUT.md](DIRECT_FORMULA_CHECKOUT.md). The implementation notes below describe the earlier transitional version.

# Account and Bag flow — 9 September 2026

My Creations navigation/page and the Save your perfume panel are removed from the active app. Google login, account email and sign-out are available from the person icon in the header on desktop and mobile.

Current flow: Build → Add to Bag → Checkout → Google sign-in if needed → return to Bag → Checkout → address/review → order/payment. Both single bottles and three-formula bundles use this flow; mixed Bag lines are passed to the existing checkout API.

Creations remain internal formula records required by the existing secure checkout RPC. They are prepared automatically, using stable per-account IDs for safe retries, without a customer save step. Historical records are not deleted. No migration, role change, or payment implementation change is needed. Prices are still calculated by Supabase. The bag clears after successful order creation.

Changed: src/app/App.tsx, src/components/Header.tsx, src/components/AccountMenu.tsx, src/components/AppScreens.tsx, src/lib/bagCheckout.ts, src/cloud.css.

Validation: TypeScript, ESLint and production build passed. Desktop header/menu verified; mobile 438px has no horizontal overflow and no Save Creation panel. Disposable authenticated API test verified single + bundle formula preparation, identical retry IDs and a Supabase quote of Rp517000 despite intentionally incorrect local prices. No order/payment was submitted; the temporary user and formula/address records were cleaned up.
