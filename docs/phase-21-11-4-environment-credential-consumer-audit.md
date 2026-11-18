# Phase 21.11.4 — Environment Variable and Credential Consumer Audit

**Status:** Repository-side consumer mapping and platform variable-name inventory completed for the API, database-backup service, Cloudflare media Worker, and Vercel production environment. User confirmed there are no Railway cross-service variable references. No variables or credentials were changed.

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
| `R2_ACCESS_KEY_ID` | No consumer found in repository source search | Likely unused on API; user confirmed no Railway cross-service variable references; do not remove without separate approval |
| `R2_SECRET_ACCESS_KEY` | No consumer found in repository source search | Likely unused on API; user confirmed no Railway cross-service variable references; do not remove without separate approval |
| `SPORTSMACK_DATABASE_BACKUPS_ACCESS_KEY_ID` | No consumer found in repository source search | Likely unused on API; backup service uses a different variable name; user confirmed no Railway cross-service variable references |
| `SPORTSMACK_DATABASE_BACKUPS_SECRET_ACCESS_KEY` | No consumer found in repository source search | Likely unused on API; backup service uses a different variable name; user confirmed no Railway cross-service variable references |

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
- Confirmed Vercel production-only variable: `NEXT_PUBLIC_API_URL`.
- Its value was not copied into this audit; it should point to the intended production API base URL.
- The repository source search did not find a direct `VERCEL_URL` consumer.

## 6. Variables that must not be removed yet

The four API-side variables below have no repository consumers identified, and the user confirmed that no Railway cross-service variable references consume them. They are likely unnecessary on the API, but remain unchanged; this audit does not authorize deletion. Any separate external scripts or operational processes should be considered before a future removal:

- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `SPORTSMACK_DATABASE_BACKUPS_ACCESS_KEY_ID`
- `SPORTSMACK_DATABASE_BACKUPS_SECRET_ACCESS_KEY`

Do not remove the backup service's separate `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY`; the backup script requires them.

## 7. Additional platform observations

- `SPORTSMACK_BACKEND_URL` is present but has no value in either the Railway API or Worker service. It is currently inert; do not populate it without identifying a concrete consumer and requirement.
- The Railway database-backup service inventory is `AGE_RECIPIENT`, `AWS_ACCESS_KEY_ID`, `AWS_DEFAULT_REGION`, `AWS_SECRET_ACCESS_KEY`, `DATABASE_URL`, `R2_BUCKET`, and `R2_ENDPOINT`. These match the backup script's expected inputs; retain the backup service's separate AWS credentials.
- The Cloudflare `sportsmack-media` Worker has plain variable `ALLOWED_ORIGINS`, secret `MEDIA_UPLOAD_SECRET`, and R2 binding `MEDIA_BUCKET`. This matches the Worker implementation.
- The Vercel production-only variable is confirmed as `NEXT_PUBLIC_API_URL`.
- The user confirmed there are no Railway cross-service variable references among the reviewed services.

## 8. Audit conclusion

The repository-side consumer mapping and the user-provided platform inventories are reconciled. The API-side R2/backup credential names are likely unused by the API; they are documented as candidates for a separately approved cleanup, not deleted in this phase. The database-backup service's `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`, Cloudflare Worker `MEDIA_UPLOAD_SECRET`, and `MEDIA_BUCKET` binding must be retained for their documented consumers.

No secret values were collected. No production environment variables, credentials, service settings, or deployments were changed in Phase 21.11.4.
