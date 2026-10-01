# Perfun Lab — Supabase integration

Connected project: `perfun lab project` (`fcightecxkegtqlaxvjs`).

**Stage 2 update:** Checkout and Orders now use Supabase. The stage-1 references below to local checkout/Orders are historical. See [CHECKOUT_ORDERS.md](CHECKOUT_ORDERS.md) for current schema, migrations, addresses, snapshots and verification.

## Current implementation

- React + Vite uses `@supabase/supabase-js` with PKCE, persisted sessions and automatic token refresh.
- Google sign-in and sign-out appear above the existing builder. The local note draft survives the OAuth redirect.
- `My Creations` is available from the account bar on desktop and mobile. Saving navigates there immediately; opening it again fetches the current user's creations from Supabase.
- Profiles are created by an `auth.users` trigger, including Google registrations. Existing auth users without profiles are backfilled. Roles are `customer`, `admin`, `perfumer`, `vendor`; registration always uses `customer` and ignores any role supplied through user metadata.
- Catalog notes, phase copy, icons, colors, profiles and product prices load from Supabase. There is no hard-coded runtime catalog fallback. Existing local cart entries are repriced from the catalog when the app loads.
- `save_creation` is an atomic, security-invoker RPC. A retry with the same UUID returns the saved creation. Each creation must contain exactly one top, middle and base note. A partial unique index allows Soapy at any phase, but only once per creation, including concurrent/direct writes.
- Customers can update their own profile display fields and their own creation data; cannot change roles or mutate the catalog. RLS checks ownership for both parent and child tables. Roles beyond customer have no new dashboard or cross-user creation access in this stage.
- Assets stay under `public/`; database asset paths refer to public URLs such as `/notes/example.webp`, never `/public/notes/example.webp`. Existing notes currently use their original icons. No Storage bucket is used.
- Existing bag, demo checkout, shipping estimate and local Orders remain prototype features. They are not database orders or payment processing.

## Files added / changed

- `package.json`, `package-lock.json`: pinned Supabase client dependency.
- `README.md`, `.gitignore`: integration entry point and ignored CLI temporary files.
- `.env.example`, `.env.local`, `src/vite-env.d.ts`: public client configuration; `.env.local` is ignored by the existing `.gitignore`.
- `src/lib/supabase.ts`, `src/lib/catalog.ts`, `src/lib/creations.ts`: client, catalog queries and creation API.
- `src/hooks/useAuth.ts`, `src/hooks/useBlend.ts`, `src/hooks/useCart.ts`: auth, database catalog normalization and database pricing.
- `src/app/App.tsx`, `src/components/Builder.tsx`, `src/components/SaveCreation.tsx`, `src/pages/MyCreationsPage.tsx`, `src/types/index.ts`, `src/cloud.css`: integrate existing builder with account/save/collection UI.
- `src/data/notes.ts`, `src/data/products.ts`: retain UI copy/types and existing prototype shipping constant; original catalog data now lives in migration seed SQL.
- `supabase/migrations/20260908054329_perfun_auth_catalog_creations.sql`: schema, profile upgrade, roles, RLS, RPC, constraints, indexes and seeds. Already applied to the connected project; local version matches remote migration history.
- `supabase/tests/ownership.sql`: repeatable transaction-based security and integrity checks; rolls back all fixtures.
- `SUPABASE_SETUP.md`: this setup and handoff guide.

## Environment

For the connected project, `.env.local` is already populated. For another environment, copy `.env.example` to `.env.local` and provide:

```dotenv
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_<key>
```

Find these in Supabase project settings / API keys. Only the publishable key is needed. Never put a service role key, secret API key, database password or Google Client Secret in a `VITE_` variable. Vite embeds these variables into the browser bundle; restart the dev server or rebuild after editing them. Supply both variables in your hosting environment before building.

```sh
npm ci
npm run dev
npm run build
npm run lint
```

## Manual Google OAuth setup (required)

Google provider was verified **disabled** on 8 September 2026. Complete these steps:

1. In Google Cloud / Google Auth Platform, configure Branding, Audience and the consent screen. While the app is in Testing, add your Google account(s) as test users. Use `openid`, email and profile scopes.
2. Create an OAuth Client ID with type **Web application**. Add your actual app origins, for example `http://localhost:5173`, `http://127.0.0.1:5173`, and your production origin.
3. Add this **Authorized redirect URI** in Google:
   `https://fcightecxkegtqlaxvjs.supabase.co/auth/v1/callback`
4. In Supabase → Authentication → Sign In / Providers → Google, enable Google and paste the Client ID and Client Secret. The secret belongs only in this provider configuration.
5. In Supabase → Authentication → URL Configuration, set **Site URL** to the production app URL (or your local URL while developing). Add explicit allowed redirect URLs such as `http://localhost:5173/`, `http://127.0.0.1:5173/`, and `https://your-domain/`. If hosting under a subpath, allow the exact application path. The app returns to its current origin and pathname.
6. In Data API settings, keep `public` exposed. Keep `private` unexposed. The migration already grants catalog reads and authenticated data access, protected by RLS.
7. Verify with a real Google account: sign in → select three notes → Save Creation → My Creations → reload → open My Creations again → sign out. A second account must not see the first account's creations.

Reference: [Supabase Google sign-in guide](https://supabase.com/docs/guides/auth/social-login/auth-google).

## Migration usage

The connected project is already migrated; **do not paste/reapply the SQL there**. For future migrations, use Supabase CLI `migration new`, keep SQL files in version control and apply through `db push` after linking to the intended project. For a new empty Supabase project, initialize/link using the CLI, then apply this migration. It bootstraps profiles as well as the six new tables; it does not recreate the unrelated existing `addresses` table.

Product seeds (IDR): 10 ml normal 129000 / launch 109000; 30 ml normal 229000 / launch 199000; bundle 3 × 10 ml 299000. The bundle has no invented normal-price discount. Catalog reads are intentionally public; private profile/creation records require an authenticated owner.

To change a role, use a trusted SQL Editor/admin backend, e.g. `update public.profiles set role = 'perfumer' where id = '<user-uuid>';`. Never accept roles from browser metadata. To atomically edit a formula in a future UI, add an invoker RPC so all three rows update in one transaction; direct single-row deletions intentionally cannot leave incomplete creations.

## Verification and known limits

- TypeScript compile and ESLint passed; production Vite/PWA build passed.
- Live SQL tests passed for auto-profile creation, default role despite malicious metadata, profile ownership/update, blocked role escalation, read-only catalog, atomic saves and retry, cross-user read/update/delete rejection, ownership reassignment rejection, phase validation, Soapy in all three phases, duplicate Soapy rejection, complete formulas and cascade deletion. Tests leave no fixture data.
- Live Supabase Security Advisor returned no findings.
- Browser verification against the live Supabase API passed using a disposable email/password test account (no email was sent): catalog and exact prices, disabled duplicate Soapy, save from the UI, database record with three notes, My Creations rendering, persistence after reload, session restoration and sign-out privacy. Mobile 390px and desktop 1440px were visually checked. The test account and its creation were removed after sign-out. This tests the authenticated app flow, not Google's OAuth consent/callback.
- Google consent/callback cannot be fully tested until the provider and Google credentials above are configured.
- Catalog requires an internet connection. Load failures show a retry state rather than stale hard-coded data.
- The old checkout/shipping/orders prototypes are not implemented as production features in this stage.
- This workspace currently has no Git repository, so no commit was created.
