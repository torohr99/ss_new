# Phase 21.10.5 — Operational runbooks

**Purpose:** Provide a safe first-response procedure for production incidents. These runbooks are diagnostic first. Do not restart services, roll back deployments, change secrets, alter resource limits, run migrations, or modify data until the cause and impact are understood and the operator has explicitly approved the action.

## 1. API unavailable

**Signals:** UptimeRobot reports the API monitor Down, Railway reports a crashed/failed deployment, or `GET /health` fails.

1. Check the UptimeRobot incident details and timestamp.
2. Open Railway → SportSmack → production → API.
3. Inspect deployment status, recent deploy history, restart/crash events, CPU, memory, and logs around the incident.
4. Check whether both API replicas are affected or only one.
5. Test the public `/health` endpoint manually.
6. Check `/api/status` to distinguish process liveness from PostgreSQL/Redis dependency health.
7. Inspect PostgreSQL and Redis service status and logs.
8. Compare the incident start with the most recent deployment or configuration change.
9. Preserve relevant timestamps and log excerpts (redact credentials, cookies, tokens, and personal data).
10. Escalate before rollback/restart or configuration changes. After recovery, confirm UptimeRobot reports Up and `/api/status` reports healthy dependencies.

## 2. Failed deployment, crash, or OOM kill

**Signals:** Railway notification for deployment failure, crash, or OOM kill; repeated restarts; memory approaching the service limit.

1. Identify the affected service and exact deployment/restart timestamp.
2. Inspect the deployment build/runtime logs and the preceding successful deployment.
3. Review memory and CPU trend leading up to the event.
4. For API, check both replicas and determine whether failures are isolated or simultaneous.
5. For Worker, inspect startup, shutdown, job, and Redis lock logs; verify whether a job is still active before considering recovery.
6. Do not increase memory limits or alter restart policy solely to silence the alert.
7. Preserve the failed deployment ID and relevant redacted logs.
8. Obtain approval before rollback, restart, resource-limit changes, or deployment changes.
9. After approved recovery, confirm stable service health and no repeated restart/OOM event.

## 3. PostgreSQL unavailable, slow, or storage growth

**Signals:** `/api/status` reports database unhealthy, Railway database metrics show abnormal resource use, or API logs show database connection/query failures.

1. Check Railway PostgreSQL service status and recent logs.
2. Distinguish normal checkpoint `LOG` entries from actual `ERROR`/fatal messages. A checkpoint that starts and completes normally is not itself an incident.
3. Review CPU, memory, disk usage, connection count, and connection trend.
4. Check API logs for connection timeouts, pool exhaustion, or repeated query failures.
5. Check whether the issue coincides with a deployment, load spike, or backup execution.
6. Do not delete data, vacuum manually, raise connection limits, or change pool configuration as an initial response.
7. If storage continues to grow, record daily values and identify table/index/WAL contributors through an approved read-only investigation.
8. Escalate before any database maintenance, restore, or configuration change.
9. After recovery, verify `/api/status`, application behavior, and backup freshness.

## 4. Redis unavailable or degraded

**Signals:** `/api/status` reports Redis unhealthy, API/Worker logs show Redis connection errors, or queue/pub-sub behavior stops.

1. Check Railway Redis service status, memory, connected clients, and logs.
2. Inspect API and Worker logs for connection errors and retry loops.
3. Determine whether API sessions, rate limiting, Socket.IO cross-replica messaging, or Worker coordination are affected.
4. Check Worker lock state through the existing operational procedure; do not delete lock keys without confirming ownership and expiry.
5. Do not flush Redis, restart Redis, or change memory/eviction policy without approval.
6. After recovery, verify Redis connectivity, `/api/status`, worker progress, and Socket.IO behavior if affected.

## 5. Background Worker stalled, failing, or losing its lock

**Signals:** unexpected Worker restart, repeated job failures, no expected job progress, or lock recovery/lost-lock messages.

1. Open Railway → production → Worker and inspect deployment status, restart history, resource metrics, and logs.
2. Identify the job type, last successful progress marker, and first failure timestamp.
3. Check Redis health and whether the expected lock is present, owned, and within its TTL using approved read-only diagnostics.
4. Check whether another replica/process is already performing the work.
5. Do not manually remove a lock or replay a job until duplicate-execution safety is established.
6. Preserve the job identifier and redacted error details.
7. Obtain approval before restarting the service, clearing a lock, or replaying work.
8. Confirm job progress resumes and no duplicate side effects occur.

## 6. Scheduled database backup missing or failed

**Signals:** backup service logs show failure, the scheduled execution is absent, or no `BACKUP_VERIFIED` marker appears within 26 hours.

1. Open Railway → production → database-backup service.
2. Inspect the latest execution and its full logs.
3. Record the last known successful timestamp and `BACKUP_VERIFIED` marker.
4. Determine whether the scheduled job ran, whether encryption completed, and whether upload to the configured R2 backup bucket completed.
5. Check the R2 backup bucket for the expected recent object using the established backup procedure; do not expose object credentials or encryption keys.
6. Preserve the last known-good backup. Do not delete old backups to make room as an initial response.
7. Do not rotate credentials, edit the schedule, or run a restore over production.
8. Escalate and obtain approval before manually rerunning a backup or changing service configuration.
9. After an approved recovery, confirm a new `BACKUP_VERIFIED` marker and independently verify object presence.

**Current monitoring limitation:** No automated missing-backup alert is configured. Until one is added, the backup service logs must be reviewed manually on a regular schedule. The 26-hour threshold is a candidate operational target, not an active alert.

## 7. Cloudflare media Worker or R2 failure

**Signals:** media upload/delete/transformation failures, Worker invocation errors, or users report broken media.

1. Open Cloudflare → Workers & Pages → `sportsmack-media`.
2. Review request/invocation volume, errors, exceptions, and execution duration for the incident window.
3. Check Cloudflare service status and R2 bucket availability.
4. Inspect the Worker deployment/version history and recent configuration changes.
5. Check Railway API logs for media-worker request failures and verify service connectivity.
6. Do not expose or copy Worker secrets, R2 credentials, signed URLs, or upload tokens into incident notes.
7. Do not make the R2 bucket public or bypass signed-upload/ownership checks to restore service.
8. Obtain approval before changing Worker configuration, secrets, bindings, or deploying a new Worker version.
9. After recovery, validate one authorized upload and retrieval using the established test procedure; do not use another user's media object.

**Current monitoring limitation:** Cloudflare Worker observability and Worker-specific alert routing were not enabled/verified in this phase. Worker analytics were manually reviewed; the observed sample was only 12 invocations with no errors.

## 8. Elevated API errors or slow responses

**Signals:** Railway request error-rate/response-time metrics rise, HTTP 5xx logs appear, or users report slow requests.

1. Establish the exact start time, duration, affected endpoints, and whether errors are continuing.
2. Review Railway API request metrics and logs for 5xx responses and slow requests.
3. Compare the issue with deployment history, traffic/egress, API memory/CPU, and replica behavior.
4. Check PostgreSQL and Redis health, connections, and latency.
5. Check Worker activity if requests depend on background processing.
6. Avoid treating one isolated network egress spike as proof of an incident without correlated failures or traffic evidence.
7. Do not raise rate limits, disable protections, or scale resources as a first response.
8. Preserve representative request IDs and redacted logs; never record tokens, cookies, passwords, or full sensitive request bodies.
9. Escalate before rollback or configuration changes.
10. Confirm error and latency metrics return to baseline after approved recovery.

## 9. Incident notes and closure

For every material incident, record:

- Start and end timestamps with timezone.
- Affected service(s), deployment ID, and replica if applicable.
- User-visible symptoms and scope.
- Relevant metrics and redacted log excerpts.
- Actions taken, who approved them, and their results.
- Data integrity/backup implications.
- Recovery verification and follow-up prevention work.

Do not include passwords, JWTs, cookies, API keys, signed URLs, raw reset/verification tokens, or database connection strings in incident notes.
