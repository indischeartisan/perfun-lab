# Staging and dashboard preview

This repository has no automatic Cloudflare preview deployment. Do not use the
production Pages project or production Supabase project for dashboard review.

## Before any remote action

1. Create or select a separate Supabase staging project. It must be empty of
   production customer data and have a project ref different from production.
2. Create a separate Cloudflare Pages staging project, or connect a dedicated
   staging branch. Keep production `main` and its Pages project untouched.
3. Configure the staging Pages build with `npm run build:staging`, not `npm run build`.
4. Add only staging values to the Pages build environment:
   `VITE_DEPLOYMENT_ENV=staging`, `VITE_SUPABASE_URL`,
   `VITE_SUPABASE_PUBLISHABLE_KEY`, and
   `PERFUN_PRODUCTION_SUPABASE_PROJECT_REF`.
   The last value is a guard and must be the production ref, never the staging ref.
5. Configure the staging Supabase Auth Site URL and allowed redirect URL for the
   staging Pages hostname. Do not add staging URLs to production Auth.
6. Keep shipping feature settings disabled and origin inactive. Do not provide
   DOKU live credentials or RajaOngkir production credentials to staging.

The staging build fails if its config is absent, if the deployment marker is not
`staging`, or if the target Supabase ref matches the protected production ref.
It also rejects a local staging URL that equals `.env.production` when that file
exists. `.env.local`, `.env.production`, and `.env.staging` are ignored by Git.

## Apply schema to staging after approval

Use a scoped staging-only credential. First compare migration history, then
apply the repository migrations to the staging project only. Never run `db push`
until `supabase link` points to the staging project and the project ref has been
visually checked. Deploy Edge Functions only to staging, with staging secrets.

## Seed dashboard demo data

`supabase/seeds/staging_demo.sql` contains only fictional accounts, contacts,
addresses, order numbers, and shipment data. It is not a migration and is not
run by CI. It requires a staging-only session confirmation and a separately
supplied throwaway password; it fails by default. Run it only after checking the
connected database project ref and after configuring the confirmation settings
in the same staging database session. Never put the password in a command line,
repository file, CI log, or shell history.

The fixture creates Admin, Vendor A, Vendor B, and customer accounts plus paid
10 ml, 30 ml, and Play Set dashboard records. It deliberately leaves lifecycle
transitions for browser/RPC testing: production, packing, actual shipping,
shipment dispatch, and payout creation can then be tested through the real UI.

## Required staging verification

1. Login with Admin and confirm all Admin tabs, assignment, production,
   packing/fulfillment monitoring, and payout workspace.
2. Login as Vendor A and verify only assigned jobs/shipments appear; complete
   the lifecycle using RPC-backed UI controls.
3. Login as Vendor B and verify Vendor A data is absent.
4. Verify `#production`, `#fulfillment`, and `#payouts` on mobile and desktop.
5. Confirm checkout shipping remains unavailable while the shipping flag is OFF.
6. Run the existing CI suite before promoting any staging configuration.
