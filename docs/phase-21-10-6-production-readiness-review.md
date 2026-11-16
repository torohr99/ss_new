# Phase 21.10.6 — Production Readiness Review

**Review date:** 2026-11-16  
**Review branch:** `phase-21-10-6-production-readiness-review`  
**Starting commit:** `cc980bf649bca7e70b35d3891b949809e876df9d`  
**Disposition:** Review completed; conditional/no-go for unconditional production security sign-off.

## Executive summary

The production application passed the tested user-facing workflows. The scheduled encrypted backup completed successfully and its verification marker and timestamped Cloudflare R2 objects were confirmed. Basic service health and the previously completed isolated recovery validation provide additional operational evidence.

Unconditional production security sign-off is **not granted**. Production still exhibits the older public metrics behavior that Phase 21.10.5 removes. The production API's live behavior is consistent with the `main` branch implementation rather than the Phase 21.10.5/21.10.6 branch implementation. Phase 21.10.5 PR #6 remains unmerged, and no production deployment or merge was performed as part of this review.

This is a release/security-readiness blocker, not an indication that the application is currently unavailable.

## 1. Production deployment and service inventory

The following production services were observed:

- **Railway API:** SportSmack API, two replicas, public domain `ssnew-production.up.railway.app`.
- **Railway Worker:** SportSmack Worker, one replica, not publicly exposed.
- **Railway backup:** `database-backup` service.
- **Railway data services:** Postgres and Redis, both online.
- **Vercel:** production project `ss-new-backendfromr`, linked to `torohr99/ss_new` and configured to deploy from `main`.
- **Cloudflare:** `sportsmack-media` Worker active; R2 media bucket remains private.

### Deployment provenance

- **Vercel production commit:** reported to match GitHub `main` at `c65b18eb2861fc6cfd9a1a0956b04ca9c25f20e2`.
- **Railway API commit SHA:** not exposed/verified in the available deployment UI.
- **Railway Worker commit SHA:** not exposed/verified in the available deployment UI.
- **Railway backup-service commit SHA:** not exposed/verified in the available deployment UI.

The following Railway values were supplied, but appear to be deployment IDs rather than Git commit SHAs; they are recorded as deployment identifiers only:

- Worker deployment ID: `4b41a966-da99-4066-a9c3-d9f81724c883`
- API deployment ID: `3acd316e-c6b0-4f08-924a-d660b2206f2e`
- Backup deployment ID: `9e985024-b5c1-4d2e-8862-1abace6453ae`

The API deployment's live behavior is consistent with the older `main` source. Railway commit provenance remains unverified.

## 2. Application health and functionality

### Passed checks

- `/health` returned a healthy response.
- `/api/status` returned a response; its production response was observed to include `instance`, `region`, and process metrics.
- The frontend loaded and appeared operational.
- Cloudflare media Worker `/health` returned `ok` for `sportsmack-media`.
- Using an existing account, the following workflows behaved as expected:
  - sign-in;
  - main feed display;
  - existing user's profile;
  - existing image delivery;
  - navigation between application sections;
  - sign-out.
- The latest production smoke-test workflow passed on commit `c65b18eb2861fc6cfd9a1a0956b04ca9c25f20e2`.

No new production user data was created as part of these checks.

## 3. Security readiness

### Confirmed production discrepancy

The production `/api/metrics` endpoint returned a JSON metrics response containing a `statusCodes` object. The exact HTTP status code was not separately recorded during the manual check; the endpoint was nevertheless reachable and returned metrics data.

This matches the older `main` implementation, which exposes public `GET /api/metrics` and includes `instance`, `region`, and `metrics` in `/api/status`.

The Phase 21.10.5 branch implementation removes the public `/api/metrics` route (expected 404) and omits `instance`, `region`, and `metrics` from public `/api/status`; protected `/api/admin/metrics` remains available to authorized administrators. The Phase 21.10.5 smoke tests assert these behaviors.

**Required release condition:** after the Phase 21.10.5 changes are approved, merged, and deployed through the normal release process, recheck production to confirm:

1. `GET /api/metrics` returns 404;
2. public `/api/status` does not expose `instance`, `region`, or `metrics`;
3. unauthenticated `GET /api/admin/metrics` returns 401;
4. the production smoke test passes against the deployed release.

No merge, production deployment, secret rotation, environment-variable change, or database migration was performed for this review.

### Previously documented residual risks

The Phase 21.10.4 security audit remains the source of record for unresolved items, including raw verification/reset token storage and verification-token expiry, validation of proxy topology before changing `trust proxy`, review of provider/database error logging for secret leakage, confirmation of Vercel URL-variable scope, review of potentially unused API-side R2/backup credentials, and additional adversarial media Worker tests.

These items were not silently treated as resolved by this readiness review.

## 4. Backup and disaster recovery

The following current production backup checks passed:

- Latest scheduled `database-backup` execution completed successfully.
- Logs contained `BACKUP_VERIFIED`.
- Timestamped backup objects were present in the Cloudflare backup bucket.
- The backup schedule remained enabled.

The isolated backup/restore validation from Phase 21.10.1 remains supporting recovery evidence. No production restore was initiated and no production backup object was overwritten.

## 5. Monitoring and operational readiness

Phase 21.10.5 monitoring and runbook work is complete with its limitations documented. Production observations for this review included:

- Railway account-level notifications enabled for the available deployment, crash, OOM, usage, and restriction events.
- Railway production Observability dashboard covering API, Worker, PostgreSQL, and Redis.
- UptimeRobot monitoring the API `/health` endpoint with a five-minute free-plan interval and an alert contact selected.
- No relevant API 5xx or slow-request log entries were observed in the previously reviewed monitoring windows.
- Cloudflare media Worker showed no errors in the reviewed 24-hour and seven-day windows.

Known monitoring gaps remain:

- no verified alert for API 5xx rate or latency thresholds;
- no automated missing-backup-freshness alert;
- Cloudflare Worker-specific observability/alerting not enabled or verified;
- Vercel runtime/monitoring configuration not fully verified;
- email alert delivery not independently tested;
- `/health` is a liveness check and does not validate database/Redis dependencies or authenticated application workflows.

The operational runbooks document manual checks where automated alerts are not available.

## 6. Final disposition and follow-up

### Review outcome

Phase 21.10.6's review and evidence collection are complete. The application workflows and scheduled backup checks passed. However, the production metrics exposure discrepancy prevents unconditional production security sign-off.

**Disposition: conditional/no-go for unconditional production readiness until the Phase 21.10.5 security behavior is deployed and verified in production.**

This review does not certify capacity for millions of registered users or very high concurrent usage. Those claims require the separate load-testing and capacity-validation phases.

### Required follow-up

1. Complete review and approval of Phase 21.10.5 PR #6; do not bypass the established release process.
2. Once explicitly approved, merge and deploy the Phase 21.10.5 changes through the normal production workflow.
3. Repeat the four production security checks listed in Section 3 and record the deployed commit SHAs where available.
4. Track the remaining Phase 21.10.4 security-audit and Phase 21.10.5 monitoring gaps in their respective remediation work.
5. Proceed to Phase 21.11 deferred security remediation and subsequent capacity-validation phases only with the relevant evidence and approvals.

---

**Change-control statement:** This review is documentation and verification only. It made no production configuration changes, secret changes, credential rotations, database migrations, production deployments, or merges.
