# Admin Testing Mode

The branch contains a separate TEST lifecycle for the main Admin and Vendor
workspaces. It is disabled by default. The migrations have not been approved
for or applied to the linked production database.

TEST runs live only in `private.test_runs`. No TEST action creates or updates
an order, payment, production job, shipment, assignment or payout. TEST shipping
records only fictional details in the TEST run: it does not call a carrier.
The A6 TEST document says **TEST — NOT FOR SHIPPING** and contains no real
shipping address. TEST does not exercise the real payment or shipping handlers.

Admin can create TEST runs from the main Orders workspace and must choose an
existing vendor and catalog notes. Assigned vendors see TEST runs in their
Pekerjaan workspace. Server functions check role and assignment for each call,
and lock the TEST run for mutations. An idempotency request ID and audit event
are recorded with each successful transition. A single explicit packing
confirmation is required before the TEST shipping action.

## Server switch — after review and explicit migration approval only

The `mode_enabled` column in `private.admin_testing_preflight_settings` is
false on installation. An authorized database operator can enable or disable it
by updating the singleton row in a controlled server-side session:

```sql
-- Enable only for a time-limited internal test.
update private.admin_testing_preflight_settings set mode_enabled = true where singleton;
-- Disable before launch.
update private.admin_testing_preflight_settings set mode_enabled = false where singleton;
```

These commands are documentation, not an instruction to run them now. Never
place service-role credentials in a browser or repository. Disabling is
serialized against in-flight TEST transactions; every data/action RPC fails
closed while disabled. The separate preflight flag does not enable TEST mode.

## Release requirements

- Review both migrations, grants, RLS, server switch and TEST documents before
  applying anything to production. Confirm a recovery plan and authorize the
  migration separately.
- Require green CI, including SQL isolation/authorization and two-session
  concurrency tests, before deployment.
- Perform authenticated Admin/Vendor browser review and physical A6 print
  testing. TEST success is not evidence that real payment, payout or carrier
  integrations work.
- Disable the feature before public launch and independently verify the switch.
