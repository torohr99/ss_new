# Phase 21.10.5.1 — Monitoring baseline

**Status:** Baseline documented; alerting and external monitoring are not yet configured or verified.  
**Scope:** Inventory existing application observability and define operational signals and candidate alert thresholds. This document does not authorize production configuration changes.

## 1. Current service inventory

| Component | Current deployment / role | Primary operational concern |
|---|---|---|
| API | Railway API service; currently configured with two replicas in the last reviewed snapshot | Availability, HTTP errors/latency, memory, restarts |
| Background worker | Separate Railway Worker service | Job progress, Redis lock ownership, unexpected exits/restarts |
| PostgreSQL | Railway managed PostgreSQL | Availability, connections, storage, backup/restore |
| Redis | Railway managed Redis | Availability, memory, connections, queue/pub-sub behavior |
| Database backup | Separate Railway backup service / scheduled job | Last successful encrypted backup and restore verification |
| Media Worker | Cloudflare Worker `sportsmack-media`, backed by private R2 bucket | Upload/delete/transformation errors, Worker exceptions, R2 access |
| Frontend | Vercel deployment | Availability, failed builds, client-side errors |

Replica counts and resource measurements are point-in-time observations from the infrastructure review, not guaranteed current values. Recheck the provider dashboards before using them as an operational baseline.

## 2. Existing application health and metrics

### Public endpoints

- `GET /health`: lightweight process liveness response. It is not a dependency-health check.
- `GET /api/status`: checks PostgreSQL and Redis and reports their status, application status, timestamp, and process uptime. Dependency checks have a bounded timeout.
- The public status response intentionally does not expose instance identifiers, region, or process metrics.
- The former public `GET /api/metrics` endpoint has been removed and should return 404.

### Protected metrics

- `GET /api/admin/metrics` remains protected by authentication and admin authorization.
- The metrics service records request count, 5xx count, status-code counts, cumulative duration, slow-request count, average duration, uptime, and Node process memory usage.
- Metrics are held in process memory. Each API replica has its own independent counters; the endpoint is not a cross-replica aggregate.
- The current snapshot does not calculate percentile latency (p50/p95/p99), time-window rates, or durable historical series. Do not interpret its average latency as p95 latency.

### Existing logging / runtime signals

- Structured application logging is present.
- Slow-request warnings and Node heap-usage warnings are present. The reviewed code has a slow-request log threshold around 1.5 seconds and a heap warning around 90%; verify current implementation before tuning.
- API and worker logs are available through their hosting service.
- Worker coordination uses a Redis lock; worker logs and lock recovery behavior are part of the existing worker lifecycle.
- The API exposes replica-identifying response headers and logs replica context, but those values are not included in the public `/api/status` body.

## 3. Monitoring gaps identified

1. No separately configured external uptime monitor has been identified. The owner is not currently aware of one; verify provider/account configuration rather than assuming none exists.
2. No verified alert policy currently covers API availability, elevated 5xx rate, latency, memory, PostgreSQL connections, Redis health, worker failures, media Worker errors, or backup freshness.
3. In-memory metrics are per replica and reset on process restart. They are useful for diagnostics, not durable monitoring or capacity reporting.
4. No p95/p99 latency history is currently provided by the application metrics snapshot.
5. The backup process has a success/failure signal in its own execution logs, but an independent alert for a missing or failed daily backup has not yet been verified.
6. Cloudflare Worker observability and alert routing have not yet been verified.
7. Provider alert notification destinations and escalation ownership have not yet been verified.

## 4. Candidate alert conditions

These are proposed starting thresholds for review and configuration in the relevant provider, not active alerts and not claims about existing platform capabilities.

| Signal | Candidate trigger | Initial response |
|---|---|---|
| API availability | Two consecutive failed external checks | Check Railway API deployment, health endpoint, logs, and dependencies |
| API 5xx rate | Greater than 2% for 5 minutes, with a minimum request count to avoid noise | Inspect API logs, recent deploys, database/Redis health |
| API latency | p95 above 2 seconds for 5 minutes | Compare provider request metrics, API logs, DB/Redis latency, and replica load |
| API memory | Sustained memory above 85%; investigate immediately if approaching platform limit | Check heap/RSS, recent traffic, leaks, and restart history |
| PostgreSQL connections | Above 80% of configured connection capacity | Inspect active/idle connections and pool settings before increasing limits |
| Redis | Unavailable, sustained memory pressure, or connection exhaustion | Check Redis service health, memory, clients, and API/worker connectivity |
| Worker | Unexpected restart, repeated job failures, or lost/stale lock | Inspect worker logs, Redis lock state, and pending work |
| Backup | No successful backup in 26 hours, or latest backup job failed | Inspect backup job logs and R2 object presence; preserve last known-good backup |
| Media Worker | Sustained upload/delete/transformation failures or elevated uncaught exceptions | Inspect Cloudflare Worker logs, binding/secret configuration, and R2 access |

Use provider-native metrics where available. Avoid introducing high-volume custom polling or writing monitoring samples into Redis/PostgreSQL as part of this baseline.

## 5. Provider-console verification still required

- **Railway:** confirm metrics and log retention/availability for API, Worker, PostgreSQL, Redis, and backup service; identify available alert conditions and notification destinations.
- **Cloudflare:** confirm Worker invocation/error/duration visibility, log availability, and alert options for `sportsmack-media`.
- **Vercel:** confirm frontend deployment/build notifications and available runtime monitoring.
- **External uptime:** determine whether an existing monitor is configured before adding a duplicate. If none exists, select a low-maintenance monitor and alert destination in a later step.
- **Notifications:** identify who receives alerts and verify delivery with a controlled test before treating alerting as operational.

## 6. Safety and change boundaries

- No production deployment, merge, environment-variable change, secret rotation, database migration, or provider alert configuration is performed by this baseline document.
- Do not expose `/api/admin/metrics` publicly to support monitoring. Use authenticated access or provider-native monitoring.
- Keep `/health` lightweight for liveness checks; use `/api/status` when dependency health is specifically required.
- Do not treat one replica's in-memory metrics as total application traffic.
- Do not page on a candidate threshold until it has been checked against normal baseline behavior and alert delivery has been tested.

## 7. Completion criteria for this step

- [x] Inventory application health and metrics endpoints.
- [x] Record known limitations of in-memory per-replica metrics.
- [x] Identify platform services and monitoring domains.
- [x] Define candidate alert conditions without representing them as active.
- [ ] Verify provider-native metrics, log retention, alert capabilities, and notification destinations.
- [ ] Verify whether an external uptime monitor already exists.

The remaining verification items move into the infrastructure-monitoring and alerting portions of Phase 21.10.5.
