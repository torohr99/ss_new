# Phase 21.10.5 — Monitoring baseline and alerting status

**Status:** Monitoring baseline and operational runbooks documented; external API uptime monitoring is configured. Some advanced alerting remains unavailable or intentionally deferred.  
**Branch:** `phase-21-10-5-monitoring-alerting-runbooks`  
**Scope:** Establish a practical production monitoring baseline, configure available low-cost notifications, document alert coverage and gaps, and provide incident-response runbooks. No production application deployment, database migration, secret rotation, or service configuration change is authorized by this phase documentation.

## 1. Production service inventory

| Component | Platform | Monitoring source |
|---|---|---|
| Frontend | Vercel | Deployment notifications and provider dashboard |
| API | Railway | Observability dashboard, service metrics/logs, public `/health`, external uptime monitor |
| Background worker | Railway | Observability dashboard and service logs |
| PostgreSQL | Railway | Observability dashboard, database metrics and logs |
| Redis | Railway | Observability dashboard, service metrics and logs |
| Database backup | Railway scheduled backup service | Backup service logs and `BACKUP_VERIFIED` success marker |
| Media Worker | Cloudflare Worker `sportsmack-media` | Worker analytics/observability dashboard |

## 2. Application health and metrics

- `GET /health` is a lightweight public process-liveness endpoint. It is used by the external uptime monitor and is not a database/Redis dependency check.
- `GET /api/status` checks PostgreSQL and Redis and reports dependency/application status. It remains public for the existing smoke-test and operational use cases.
- The former public `GET /api/metrics` endpoint was removed; it should return 404.
- `GET /api/admin/metrics` remains protected by authentication and admin authorization.
- Application metrics are process-local and reset on restart. API replicas do not share a durable aggregate; the application snapshot does not provide historical p95/p99 latency.
- Structured logs, slow-request warnings, and runtime memory warnings are available. Railway provider metrics/logs remain the primary operational view.

## 3. Verified monitoring configuration and observations (2026-11-16)

### Railway

- Account-level email and in-app notifications are enabled for all projects for deployment failures, crashes, OOM kills, usage alerts, workspace restrictions, service restrictions, and domain restrictions.
- A production Observability dashboard was created.
- Dashboard includes API, Worker, PostgreSQL, and Redis. The database-backup service was not visible in the dashboard; its logs were reviewed separately.
- Over the reviewed 24-hour period, the only `@level:error` entries reported by the operator were PostgreSQL checkpoint messages at `LOG` level, not application errors. No HTTP 5xx logs or response-time logs above 2 seconds were found in the reviewed 24-hour window.
- Worker observed peak memory was approximately 315 MB over 24 hours; network egress approximately 967 KB.
- API observed peak memory was approximately 261 MB over seven days. API network egress peaked around 268 MB in one isolated spike on 2026-11-11 around noon EST; no comparable repeat spike was observed in the review window.
- PostgreSQL volume increased from approximately 180 MB to 218 MB over seven days. Continue tracking the trend; do not extrapolate linear growth from this single interval.
- Other reviewed service metrics appeared stable over the 24-hour and seven-day windows.
- The PostgreSQL checkpoint sample showed a checkpoint starting and completing normally; it is routine database logging, not a failure signal.

Railway metric monitors for resource thresholds are plan-dependent and were not configured. The dashboard is observational, not a substitute for threshold alerts.

### External API availability

- UptimeRobot account created.
- HTTP monitor configured for `https://ssnew-production.up.railway.app/health`.
- First check reported **Up**.
- Email is selected as an alert contact.
- The free plan's five-minute check interval is accepted as the initial monitoring cadence.
- Notification delivery has not been independently tested. Do not intentionally take production offline to test it.
- This monitor checks API process liveness only; it does not verify PostgreSQL/Redis dependencies, authenticated application workflows, or frontend availability.

### Database backups

- Latest observed successful backup: **2026-11-16 01:01:21 EST**.
- The backup execution log contained the explicit `BACKUP_VERIFIED` marker.
- No independent missing-backup/freshness alert has been configured. The success marker and timestamp were manually verified in the backup service logs.
- The backup service is not currently represented on the Railway Observability dashboard; use its own service logs to inspect executions.

### Cloudflare media Worker

- Worker: `sportsmack-media`.
- No errors were observed in the reviewed 24-hour or seven-day windows.
- 12 invocations were observed in the reviewed period; this is a small sample and does not establish behavior under meaningful production traffic.
- The account UI offered an option to enable Observability and displayed a 200,000-event daily allowance. Observability was not enabled as part of this phase.
- Cloudflare documents Worker Logs as requiring the Worker observability setting to be enabled in Wrangler configuration and deployed. Enabling it would require a separate reviewed code/configuration change and Worker deployment; it was intentionally not performed here.
- No Cloudflare Worker-specific alert was verified as configured.

## 4. Candidate alert thresholds (not configured)

These thresholds are operational starting points for future alerting; they are not active monitors.

| Signal | Candidate trigger | Initial response |
|---|---|---|
| API availability | Two consecutive failed external checks | Check Railway API deployment, `/health`, logs, and dependencies |
| API 5xx rate | Greater than 2% for 5 minutes with a minimum request count | Inspect API logs, recent deploys, PostgreSQL and Redis |
| API latency | p95 above 2 seconds for 5 minutes | Compare provider request metrics, API logs, DB/Redis latency, and replica load |
| API memory | Sustained memory above 85% of service limit; investigate immediately near limit | Check memory trend, traffic, restarts, and recent changes |
| PostgreSQL connections | Above 80% of configured capacity | Inspect active/idle connections and pool settings before changing limits |
| Redis | Unavailable, sustained memory pressure, or connection exhaustion | Check service health, memory, clients, and API/worker connectivity |
| Worker | Unexpected restart, repeated job failures, or lost/stale lock | Inspect Worker logs, Redis lock state, and pending work |
| Backup | No verified successful backup within 26 hours, or latest scheduled run failed | Inspect backup logs and R2 object presence; preserve last known-good backup |
| Media Worker | Sustained upload/delete/transformation failures or elevated uncaught exceptions | Inspect Cloudflare Worker logs, bindings/secrets configuration, and R2 access |

## 5. Coverage and known limitations

| Monitoring need | Current coverage | Status |
|---|---|---|
| Railway deployment failure/crash/OOM and account restrictions | Railway email + in-app notifications enabled | Configured; delivery not test-fired |
| API process availability | UptimeRobot HTTP monitor on `/health` | Configured; first check Up |
| API HTTP 5xx / latency threshold alerting | Railway logs/metrics manually reviewed | No threshold alert configured |
| API dependency health | Public `/api/status` available for manual checks | No independent semantic/body assertion monitor |
| Railway service resource trends | Production dashboard for API, Worker, PostgreSQL, Redis | Configured; dashboard only |
| Backup success | Manual inspection of backup logs and `BACKUP_VERIFIED` | Verified for latest run; no missing-backup alert |
| Cloudflare media Worker | Analytics reviewed; no errors in sampled period | Manual review; observability/alerting not enabled |
| Frontend availability/runtime | Vercel provider dashboard/notifications not independently verified in this phase | Follow-up |
| End-to-end notification delivery | No controlled notification test performed | Not verified |

The absence of an alert is not evidence that a component cannot fail. In particular, UptimeRobot's `/health` check cannot detect a database/Redis failure if the process remains alive, and a manual backup success check cannot detect a future missed run without someone reviewing it.

## 6. Operational safety boundaries

- Do not expose `/api/admin/metrics` publicly.
- Do not change `/health` or `/api/status` semantics just to accommodate a basic HTTP uptime monitor.
- Do not treat process-local metrics as a cross-replica aggregate.
- Do not classify PostgreSQL checkpoint `LOG` messages as errors.
- Do not upgrade Railway solely for Pro-only monitors at this stage.
- Do not enable Cloudflare Worker observability by editing/deploying Wrangler configuration without a separate change review and explicit approval.
- Do not trigger production outages or failed backups to test alert delivery.
- No production deployment, merge to the production branch, secret rotation, environment-variable change, or database migration was performed for this phase.

## 7. Completion checklist

- [x] Inventory application health endpoints and existing metrics limitations.
- [x] Create Railway production Observability dashboard for API, Worker, PostgreSQL, and Redis.
- [x] Verify Railway account-level email and in-app notification preferences.
- [x] Review Railway service metrics and 24-hour logs.
- [x] Configure external API HTTP uptime monitor and confirm first check is Up.
- [x] Verify the most recent scheduled backup has a `BACKUP_VERIFIED` marker.
- [x] Review Cloudflare media Worker activity and recent errors.
- [x] Document service baselines, alert coverage, gaps, and response procedures.
- [ ] Verify actual email delivery end-to-end without inducing a production failure.
- [ ] Configure an independent missing-backup alert.
- [ ] Enable Cloudflare Worker observability and configure Worker-specific alerting through a separately reviewed change.
- [ ] Verify Vercel notification/runtime-monitoring configuration.

**Phase disposition:** The monitoring baseline and runbooks are complete, with explicitly documented limitations. The remaining unchecked items are follow-up alerting/verification improvements, not represented as completed controls. This is not a claim of comprehensive alert coverage, penetration testing, or capacity validation.
