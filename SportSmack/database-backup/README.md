# SportSmack PostgreSQL offsite backups

This directory contains a standalone, one-shot Railway job. It does not run inside the production API or Worker services.

## What each run does

1. Creates a PostgreSQL custom-format logical dump using the private Railway `DATABASE_URL`.
2. Validates the dump with `pg_restore --list`.
3. Encrypts the dump to the configured age **public recipient**.
4. Uploads the encrypted object to the private Cloudflare R2 bucket.
5. Downloads that exact object and compares its bytes, size, and SHA-256 with the uploaded file.
6. Exits nonzero if any operation or verification fails.

The job does not contain or need the age private identity. Keep the private identity offline in a separately protected location. The temporary plaintext dump is stored only in the job's ephemeral filesystem and removed when the process exits.

## Create the Railway service

Create a new service in the existing SportSmack Railway project:

- Name: `database-backup`
- Source repository: `torohr99/ss_new`
- Branch: `main` after this pull request has been reviewed and merged
- Root directory: `/SportSmack/database-backup`
- Builder: Dockerfile
- Dockerfile path: `/Dockerfile` relative to the root directory
- No public domain or networking is needed
- Restart policy: `Never`
- Cron schedule: `0 6 * * *` (06:00 UTC daily)

Railway cron schedules use UTC. 06:00 UTC is 01:00 Eastern Standard Time and 02:00 Eastern Daylight Time.

Do not configure a start command that overrides the Dockerfile CMD.

## Required Railway variables

Set these on the **database-backup service only**:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Railway variable reference to the PostgreSQL service's private `DATABASE_URL` |
| `AGE_RECIPIENT` | The age public recipient corresponding to the offline private identity |
| `AWS_ACCESS_KEY_ID` | Cloudflare R2 access key ID |
| `AWS_SECRET_ACCESS_KEY` | Cloudflare R2 secret access key |
| `AWS_DEFAULT_REGION` | `auto` |
| `R2_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `R2_BUCKET` | `sportsmack-db-backups` |

The R2 token should have Object Read & Write permissions restricted to the `sportsmack-db-backups` bucket. Do not reuse the media bucket's credentials. Never put credentials, private keys, or connection strings in this repository.

Optional variables:

- `BACKUP_PREFIX`: defaults to `sportsmack-production`
- `BACKUP_PATH_PREFIX`: defaults to `database-backups`
- `PGCONNECT_TIMEOUT`: defaults to 15 seconds
- `AWS_MAX_ATTEMPTS`: defaults to 5

## First-run verification

After deploying the service and setting variables:

1. Trigger one manual cron run.
2. Confirm the run exits successfully and logs `BACKUP_VERIFIED`.
3. Confirm the corresponding timestamped `.dump.age` object exists under `database-backups/` in the private R2 bucket.
4. Download that object to a trusted machine and decrypt it using the offline age identity.
5. Restore it into a new, empty, isolated PostgreSQL database and validate tables and representative row counts. Never restore over production as a test.
6. Confirm the scheduled run is enabled for the intended UTC time.

A successful run verifies that the archive was created, uploaded, downloaded, and byte-for-byte matched. It does not by itself prove that the age private identity is recoverable or that a future database restore will succeed; perform the isolated restore check above.

## Retention

Configure a Cloudflare R2 lifecycle rule for this bucket to expire objects with the prefix `database-backups/` after 30 days. Confirm the rule targets only this prefix. Do not implement application-side deletion in the backup script.

## Recovery

Use the documented manual recovery procedure: download the selected encrypted object, decrypt it with the protected age identity, inspect it with `pg_restore --list`, and restore it into an isolated PostgreSQL database with `pg_restore --no-owner --no-acl`. Validate the restored schema and data before considering any production recovery.

Keep the age private identity and its passphrase (if one is used) separate from Railway and R2. If the private identity is lost, the encrypted backups cannot be decrypted.
