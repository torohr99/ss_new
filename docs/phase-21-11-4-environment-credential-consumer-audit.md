# Phase 21.11.4 — Environment Variable and Credential Consumer Audit

**Status:** Repository-side consumer mapping completed for the known API, media Worker, and backup-service variables. Current deployed variable-name inventory and external-consumer confirmation remain outstanding. No variables or credentials were changed.

## 1. Audit rules

- Record variable names and consumers only; never copy secret values into this repository or chat.
- Distinguish API, Worker, backup service, and Vercel scopes. A variable used by one service is not automatically required by another.
- Do not remove a variable solely because a repository text search returns no match. Check platform references, deployment configuration, scheduled jobs, and external consumers first.
- No secret rotation, deletion, or service configuration change is authorized by this audit.

## 2. SportSmack API service

| Variable | Repository consumer / evidence | Assessment |
|---|---|---|
| `DATABASE_URL` | Prisma PostgreSQL datasource and Prisma Client | Required |
| `REDIS_URL` | API Redis client, Socket.IO Redis adapter, and background worker | Required |
| `JWT_SECRET` | Auth route JWT signing, auth middleware verification, chat/fantasy socket authentication; production startup validation | Required; keep unique and high entropy |
| `FRONTEND_URL` | Origin policy and verification/reset email links; production startup validation | Required |
| `RESEND_API_KEY` | Backend mailer | Required for email delivery |
| `RESEND_FROM` | Backend mailer and auth email sender; has a code fallback | Optional |
| `MEDIA_WORKER_URL` | Media upload/delete routes and media URL validation | Required for Worker-backed media |
| `MEDIA_UPLOAD_SECRET` | Backend media route signs short-lived upload/delete authorizations | Required; must match Worker secret |
| `R2_ACCESS_KEY_ID` | No consumer found in repository source search | Likely unused on API; external-consumer check required before removal |
| `R2_SECRET_ACCESS_KEY` | No consumer found in repository source search | Likely unused on API; external-consumer check required before removal |
| `SPORTSMACK_DATABASE_BACKUPS_ACCESS_KEY_ID` | No consumer found in repository source search | Likely unused on API; backup service uses a different variable name; external-consumer check required |
| `SPORTSMACK_DATABASE_BACKUPS_SECRET_ACCESS_KEY` | No consumer found in repository source search | Likely unused on API; backup service uses a different variable name; external-consumer check required |

Other code-consumed or optional API variables found during source review include:

- `NODE_ENV`: production behavior, secure cookie settings, logging, and production environment validation.
- `PORT`: HTTP listener; defaults to 5000.
- `START_API`, `START_WORKER`: process selection in `start.js`.
- `SUPERVISOR_SHUTDOWN_GRACE_MS`: parent-process shutdown grace period.
- `RAILWAY_REPLICA_ID`, `RAILWAY_REPLICA_REGION`: replica/region observability; platform-provided where available.
- `RENDER_INSTANCE_ID`: legacy/platform fallback for instance identity.
- `LOG_LEVEL`: optional logger level.
- `LOAD_TEST_SECRET`: controlled local/test rate-limit bypass only; it does not bypass standard production rate limits.
- `GEMINI_API_KEY`, `GEMINI_MODEL`: AI/game-analysis integration.
- `OPENAI_API_KEY`, `OPENAI_IMAGE_MODEL`: optional AI/image integration.

## 3. Separate database-backup service

The repository's `SportSmack/database-backup/backup.sh` requires:

| Variable | Consumer |
|---|---|
| `DATABASE_URL` | `pg_dump` source database |
| `AGE_RECIPIENT` | Encrypts the dump for the offline age private identity |
| `AWS_ACCESS_KEY_ID` | AWS CLI authentication to Cloudflare R2 |
| `AWS_SECRET_ACCESS_KEY` | AWS CLI authentication to Cloudflare R2 |
| `R2_ENDPOINT` | R2 S3-compatible endpoint |
| `R2_BUCKET` | Destination bucket |

`AWS_DEFAULT_REGION` is optional in the script and defaults to `auto`. The script also supports optional `BACKUP_PREFIX`, `BACKUP_PATH_PREFIX`, `PGCONNECT_TIMEOUT`, and `AWS_MAX_ATTEMPTS`.

These are backup-service variables. They do not establish a need for the similarly purposed API-side credential names listed in section 2. The backup service must retain its own scoped credentials.

## 4. Cloudflare media Worker

| Variable / binding | Consumer | Assessment |
|---|---|---|
| `MEDIA_UPLOAD_SECRET` | HMAC verification of API-signed upload/delete authorizations | Required secret; must match API signing secret |
| `MEDIA_BUCKET` | R2 binding to `sportsmack-media` | Required binding |
| `ALLOWED_ORIGINS` | Worker CORS allowlist in `wrangler.jsonc` | Configured variable |

The Worker uses the R2 bucket binding. The repository README explicitly says the application does not require R2 access-key credentials for this media path.

## 5. Frontend / Vercel

- `NEXT_PUBLIC_API_URL` is referenced throughout the frontend and should point to the intended API base URL.
- The repository source search did not find a direct `VERCEL_URL` consumer.
- A prior environment review recorded that a production URL-valued variable existed in Vercel, but its exact name and scope were not established in the source inventory.

The actual Vercel variable names and scopes must be checked in the Vercel project settings without copying values.

## 6. Variables that must not be removed yet

The four API-side variables below are strong candidates for removal, but remain unchanged pending confirmation that no Railway variable references, deployment templates, external scripts, or operational processes consume them:

- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `SPORTSMACK_DATABASE_BACKUPS_ACCESS_KEY_ID`
- `SPORTSMACK_DATABASE_BACKUPS_SECRET_ACCESS_KEY`

Do not remove the backup service's separate `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY`; the backup script requires them.

## 7. Remaining completion evidence

To complete the platform-side part of this audit, capture **variable names only** (never values) for:

1. Railway SportSmack API service.
2. Railway database-backup service.
3. Railway Worker service, if it has its own variables.
4. Vercel production project and relevant deployment scopes.
5. Cloudflare Worker secrets and plain vars (names only), plus the R2 binding name.

Then confirm whether any of the four candidate API-side R2/backup variables are referenced by Railway variable references or any external process. Only after that evidence is reviewed should a separate, explicitly approved removal be considered.

**No production environment variables were changed in Phase 21.11.4.**
