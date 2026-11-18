# Phase 21.11.5 — Error Logging, Proxy Topology, and Vercel URL Review

**Status:** Targeted authentication, mailer, central error handling, and AI/media route logging remediation committed. Regression tests cover the shared metadata allowlist and mailer failure handling. Broader route/worker error-call-site review and non-production client-IP header validation remain. No production configuration or rollout was performed.

## 1. Error logging review

### Current behavior

- Production Winston output is timestamped JSON and includes stack traces for Error objects.
- The logger uses `LOG_LEVEL`, defaulting to `info`.
- The Express final error handler now logs only allowlisted error metadata (`name`, `code`, and `type`) alongside request ID, method, path, and status. It no longer serializes arbitrary error properties, request-body fragments, provider response payloads, or stack/message text.
- Dependency health-check failures use the same allowlisted metadata rather than logging raw database/Redis error objects.
- Authentication route and authentication middleware error logs now use the allowlisted metadata helper.
- AI route failures no longer log provider response bodies or raw error messages; they log allowlisted metadata.
- Media upload, protected image delivery, and deletion failure logs now use allowlisted metadata.
- The mailer no longer attaches the full Resend response body to thrown errors. Provider failures expose only a generic message, HTTP status, and stable error code to callers/logging.
- The logged path is `req.path`, not the full URL with query string.
- The error response in production returns a generic message and request ID rather than the underlying exception message.
- Some auth, mail, and background-worker paths also use `console.error`/logger calls.

### Assessment

No explicit logging of passwords, JWTs, raw verification/reset tokens, authorization headers, or environment-variable values was found in the reviewed paths. However, the logger has no centralized field-redaction policy. Full third-party/ORM/network error objects may contain implementation details, so the remaining error call sites should be checked before claiming that all sensitive fields are excluded.

Do not add broad object serialization or request-body logging. If redaction is introduced, add tests using sentinel values for passwords, cookies, bearer tokens, database URLs, and mail-provider credentials.

## 2. Proxy topology and rate-limit identity

### User-confirmed Railway topology

- The API service has a public HTTP domain and Railway private networking/private hostname.
- The API service has no TCP Proxy.
- The Railway Worker service has `DATABASE_URL` and `REDIS_URL` connections to the Postgres and Redis services; these are database/cache connections, not API calls.
- The database-backup service uses `DATABASE_URL` to connect to Postgres.
- The Redis service's `REDIS_URL` is the Redis connection endpoint.
- The Postgres service's `DATABASE_URL` and `PGHOST` refer to the Postgres service itself.
- No service-to-API call through the API's private hostname has been identified in the supplied inventory.

Important distinction: `DATABASE_URL`, `REDIS_URL`, and `PGHOST` identify database/cache endpoints. Their presence does not establish that those services call the API over private networking.

### Source finding

The API currently sets:

```js
app.set('trust proxy', 1);
```

The standard and auth limiters use Express's `req.ip` by default. The user-or-IP limiter also falls back to `req.ip` for unauthenticated requests.

Express documents that numeric `trust proxy` settings assume a known hop count and warns that paths with different hop counts can allow client-supplied forwarding values to influence the result:
https://expressjs.com/en/guide/behind-proxies/

Railway's current public-networking specifications document `X-Real-IP` as the header for identifying the client's remote IP. Railway documents private networking as direct service-to-service communication that bypasses the public edge. TCP Proxy is a separate feature for exposing raw TCP services; the API has no TCP Proxy enabled.
Sources:
- https://docs.railway.com/networking/public-networking/specs-and-limits
- https://docs.railway.com/networking
- https://docs.railway.com/networking/tcp-proxy

### Assessment

The topology evidence now indicates that ordinary external API requests arrive through Railway's public HTTP edge, while the listed internal connections are to Postgres and Redis—not to the API. This removes the previously unresolved possibility of known private service callers to the API, based on the inventories supplied.

However, it does not by itself prove the exact forwarding-header chain observed by the API process or prove that `trust proxy = 1` produces the desired client IP. Railway documents `X-Real-IP`; Express's numeric trust setting derives `req.ip` from the proxy chain. These are distinct mechanisms.

Do not change `trust proxy` to `true`, increase the hop count, or trust a guessed Railway CIDR. Before changing rate-limit identity, validate the public edge's behavior in a non-production deployment. The test should record only the socket peer, `X-Real-IP`, `X-Forwarded-For`, and resulting `req.ip`; compare normal requests with deliberately forged forwarding headers. Never log cookies, authorization headers, or request bodies.

### Remaining evidence

- Confirm by code/configuration review that no API private hostname is consumed by another service, scheduled job, or external integration.
- In a non-production deployment, compare the socket peer, `X-Real-IP`, `X-Forwarded-For`, and `req.ip` for normal and deliberately forged public-edge requests.
- Confirm the chosen rate-limit client identity is stable and cannot be spoofed before changing the production implementation.

## 3. Vercel/API URL configuration

- Frontend source repeatedly reads `NEXT_PUBLIC_API_URL`, with a local `http://localhost:5000` fallback.
- Backend `FRONTEND_URL` is used by CORS/origin policy and email-link generation.
- The backend production startup requires `FRONTEND_URL`.
- User confirms Vercel's production-only variable is named `NEXT_PUBLIC_API_URL` and believes it points to the intended production Railway API.
- User reports that Railway API `FRONTEND_URL` points to the Vercel frontend origin and does not include preview deployment origins. These values were not independently inspected or copied into this audit.
- The repository has no committed `vercel.json`, frontend `.env.example`, or `next.config.js` at the inspected paths.

### Assessment

The variable names and reported scopes/origins are consistent with the application configuration. Treat the actual URL values as user-confirmed belief rather than independently verified platform evidence. No value needs to be pasted into chat or committed.

## 4. Completion criteria

Phase 21.11.5 remains open until:

1. Review remaining fantasy, posts, moderation, search, worker, process-supervisor, and server process/shutdown error-logging call sites; convert unsafe raw error-object logging to the allowlisted helper and extend regression tests as needed.
2. API private-hostname consumers are ruled out by configuration/code review, and the public-edge client-IP behavior is validated in non-production.
3. Rate-limit behavior is tested against normal and forged public forwarding headers.
4. Vercel production `NEXT_PUBLIC_API_URL` and API `FRONTEND_URL` are confirmed by the user as described above; no secret values are required.
5. Any resulting code/configuration change has tests and a separate approval before production rollout.

No proxy, rate-limit, logging, or Vercel environment changes were made in this phase.
