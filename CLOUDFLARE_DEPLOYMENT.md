# Cloudflare deployment

Production URL: https://perfun-lab.pages.dev/

Deployed on 9 September 2026 to Cloudflare Pages project `perfun-lab`, production branch `main`. Deployment URL: https://fba37c0c.perfun-lab.pages.dev/

Only the Vite `dist` directory is uploaded. Supabase continues hosting the database, Auth and payment Edge Functions. Source files, .env files and provider secrets are not uploaded as assets. Public assets remain in `public` and are copied to `dist` during build.

## Deploy again

```sh
npm ci
npm run deploy:cloudflare
```

Wrangler OAuth login must be available. This is a Direct Upload project: deployments run from a local build, not automatic Git integration. A later CI pipeline can invoke the same deploy command. Cloudflare's built-in Git integration would require another project.

The public build variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are read from `.env.local` locally or from the CI build environment. They are compiled into the browser bundle. Do not use a service role key or payment secret here.

Added `wrangler.jsonc`, pinned Wrangler dev dependency/lockfile, `deploy:cloudflare` script, `.wrangler`/`.dev.vars*` ignores and no-cache headers for index/service worker updates.

## Required production-origin setup

1. Supabase Authentication → URL Configuration: set Site URL to `https://perfun-lab.pages.dev` and add `https://perfun-lab.pages.dev/` to redirect URLs. Keep the local redirect URLs while developing.
2. Google OAuth Web Client: add `https://perfun-lab.pages.dev` to Authorized JavaScript origins. Its authorized redirect URI remains `https://fcightecxkegtqlaxvjs.supabase.co/auth/v1/callback`.
3. Supabase Edge Function secrets: set `APP_URL=https://perfun-lab.pages.dev`. Configure DOKU sandbox credentials as described in PAYMENTS.md. Optional `PAYMENT_ALLOWED_ORIGINS` can retain local development origins.
4. DOKU notification URL remains `https://fcightecxkegtqlaxvjs.supabase.co/functions/v1/payments-webhook`.
5. Test Google sign-in on the production URL and then the complete DOKU Sandbox round trip. Deployment does not imply those provider settings have been updated.

Build passed; production URL responds HTTP 200. The production dependency audit reports no vulnerabilities; npm installation reported three high-severity development-tool dependency findings, outside the uploaded static runtime. No forced dependency upgrade was performed.
