# Migration history exceptions

## `20260909074016_direct_formula_checkout.sql`

This migration had already been recorded on the Perfun Lab Supabase production
project before the repository gained its local Linux fresh-migration CI.

The historical SQL contains `LOCK TABLE`, which PostgreSQL accepts only inside
an explicit transaction block when the Supabase CLI local runner applies SQL
statements individually. The repository therefore adds only `BEGIN` and
`COMMIT` around the existing lock, validation, and retirement statements.

- The SQL operations, their order, and the resulting schema are unchanged.
- The migration version is already recorded remotely. Never run this migration
  again against the remote project and never use migration repair to force it
  to rerun.
- The wrapper exists solely so a clean local database can replay the committed
  history in CI.
- This is a one-time documented exception, not permission to modify any other
  historical migration. All future production changes must use new
  forward-only migration files.
