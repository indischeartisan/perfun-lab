# Supabase Database Backup

`Supabase Database Backup` is deliberately manual-only. It creates a logical database backup with the Supabase CLI, restore-tests it in an ephemeral local Supabase stack on a GitHub-hosted runner, encrypts it with the owner's public `age` key, and uploads only the encrypted archive and its ciphertext checksum.

## One-time repository configuration

Create these repository-level GitHub Actions values before the first dispatch:

| Name | Type | Value |
| --- | --- | --- |
| `SUPABASE_DB_URL` | Secret | The full **Session Pooler / Session mode** PostgreSQL URL from Supabase Dashboard → Connect. It must be the IPv4-compatible pooler URL, not the direct `db.<ref>.supabase.co` URL. |
| `BACKUP_AGE_RECIPIENT` | Variable | Owner's `age1…` X25519 public recipient key. |

Generate and retain the matching private identity entirely outside GitHub and this repository. Do not store it as an Actions secret. A password manager or encrypted offline storage is appropriate.

The database credential must be protected as a privileged credential. This workflow makes no remote write call: it invokes only `supabase db dump`. It has no `GITHUB_TOKEN` permissions, does not check out repository code, and never commits an artifact.

## Download and decrypt

1. In GitHub Actions, open the successful **Supabase Database Backup** run and download its artifact before its seven-day expiry.
2. In a private directory, validate the ciphertext, then decrypt using the offline identity:

   ```bash
   sha256sum -c perfun-backup-*.tar.gz.age.sha256
   age --decrypt --identity /secure/path/identity.txt --output backup.tar.gz perfun-backup-*.tar.gz.age
   mkdir restored-files
   tar -xzf backup.tar.gz -C restored-files
   (cd restored-files && sha256sum --check SHA256SUMS)
   ```

3. Treat the extracted SQL as sensitive Production data. Never commit, attach, upload, or paste it into logs.

## Scope and recovery limitations

The archive contains roles, schema, data, and explicit `supabase_migrations` schema/data dumps. The workflow requires an isolated restore test to pass before encryption and artifact upload.

Supabase-managed schema customizations (`auth` and `storage`) require separate restore planning. Supabase Storage **objects** are not included by a database dump; only database metadata may be. Edge Function secrets, Auth dashboard settings/API keys, Realtime settings, Vault key material, and project configuration are not a complete part of this logical backup. This is not point-in-time recovery.

The private `age` identity never reaches the runner, so the workflow can validate the plaintext dump's isolated restore and the ciphertext checksum, but cannot decrypt the final artifact itself. The first successful run must be followed by the owner’s offline decrypt/checksum validation before any weekly schedule is proposed.
