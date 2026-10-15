# Preview Operations Simulator

The simulator is an isolated, synthetic workflow review tool. It has no Supabase client, production action handler, payment provider, shipping provider, RPC, Edge Function, or external mutation.

## Cloudflare Pages Preview setup

Set the following **Preview-only** Cloudflare Pages environment variable for project `perfun-lab`:

```
VITE_ENABLE_OPERATIONS_SIMULATOR=true
```

Do not set it for Production. The normal production build omits `simulator.html` and all `src/simulator/*` modules. With the Preview variable enabled, the simulator URL is:

```
https://<preview-host>/simulator.html
```

The browser also rejects the simulator unless its hostname is `localhost`, `127.0.0.1`, or a Cloudflare preview hostname ending in `.perfun-lab.pages.dev` that is not the production host `perfun-lab.pages.dev`.

After saving the Preview variable, retry the PR deployment in Cloudflare Pages. No production redeploy is needed.

## Local review

In PowerShell:

```
$env:VITE_ENABLE_OPERATIONS_SIMULATOR = 'true'
npm run dev
```

Open `http://localhost:5173/simulator.html` and use the Admin/Vendor switch in the header. Reset Demo clears the namespaced browser store `perfun-lab:operations-simulator:v1` and restores synthetic seed data.

## Deliberate limits

- The simulator is not an authentication bypass and is not linked from the production application.
- Print documents include a DEMO watermark and use synthetic data only.
- Copy, packing checklist, tracking, and payouts stay in localStorage.

## Admin workspace coverage

| Production Admin feature | Simulator location | Coverage |
| --- | --- | --- |
| Dashboard | Dashboard | Simulated with derived operational counts |
| Orders | Orders | Simulated: payment and assignment transitions |
| Production | Operations → Production | Simulated status monitor |
| Fulfillment | Operations → Fulfillment / Vendor → Kirim | Simulated shipping handoff, copy, and DEMO print |
| Vendor Assignment | Operations → Assignment exceptions | Simulated assignment transition |
| Customers | More → Customers | Available as read-only synthetic directory |
| Notes | More → Notes | Simulated local availability toggle |
| Products & Pricing | More → Products & Pricing | Simulated local availability toggle; price display is read-only |
| Vendor Payments | More → Vendor Payments | Simulated draft and paid lifecycle |
| Revenue | More → Revenue | Available as a derived synthetic sales snapshot |

The simulator deliberately does not imitate production-only concurrent-editing, catalog versioning, or external payment and shipping services. Those interactions have no fake buttons.
