Current checkout: Bag formulas go directly to server validation and order snapshots. My Creations and its database tables/RPC have been removed. See [DIRECT_FORMULA_CHECKOUT.md](DIRECT_FORMULA_CHECKOUT.md).

# PERFUN LAB

A mobile-first, installable fragrance-building prototype built with React, TypeScript, and Vite.

Supabase now provides Google Auth, automatic customer profiles, the notes/pricing catalog, and saved Creations. See [SUPABASE_SETUP.md](SUPABASE_SETUP.md) for the migration, environment variables, Google OAuth setup, changed files and verification results. Google provider must be enabled before Google sign-in works.

Checkout and Orders now use Supabase too: saved addresses, products ordered from saved Creations, immutable order snapshots and duplicate-submit protection. See [CHECKOUT_ORDERS.md](CHECKOUT_ORDERS.md) for the new migrations, schema, flow and verification. Payment and shipping APIs remain unimplemented; new orders are `pending_payment` with shipping Rp0.

## Run locally

```bash
npm install
npm run dev
```

Create a production build with `npm run build`. The generated `dist` directory can be deployed directly to Cloudflare Pages with build command `npm run build` and output directory `dist`.

## Prototype scope

- One top, one middle, and one base note per blend
- Live bottle stickers and local scent prediction
- 10 ml and 30 ml bottle options
- Persistent multi-blend bag with size and quantity editing
- Persistent unfinished formula
- Product-app navigation with Build, Bag, Orders, and More
- Mobile bottom navigation and desktop top navigation
- Local mock order history
- PWA manifest and offline application shell

Cart and builder draft data live under the `perfun-bag-v2` and `perfun-builder-draft-v3` localStorage keys. Creations, addresses and customer orders live in Supabase. The local bag is a preview; customer checkout selects saved Creations. No payment integration is included.

Notes and product prices are read from Supabase, seeded by the SQL migration. `src/data/products.ts` retains product types and the existing prototype shipping estimate.

## Frontend structure

```text
src/
  app/          App shell and navigation flow
  pages/        Build, Bag, Checkout, Orders, and More screens
  components/   Reusable product UI
  data/         Local notes and product configuration
  hooks/        Blend, cart, order, and localStorage state
  lib/          Prediction, cart identity, and currency helpers
  types/        Domain types grouped by feature
```

This keeps local prototype concerns isolated so the persistence hooks can later be
replaced by Supabase or Cloudflare Worker adapters without rewriting the product UI.
