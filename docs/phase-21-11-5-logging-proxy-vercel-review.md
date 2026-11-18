# Phase 21.11.5 — Error Logging, Proxy Topology, and Vercel URL Review

**Status:** Source review complete; production topology and Vercel environment verification pending. No production configuration or application behavior was changed.

## 1. Error logging review

### Current behavior

- Production Winston output is timestamped JSON and includes stack traces for Error objects.
- The logger uses `LOG_LEVEL`, defaulting to `info`.
- The Express final error handler logs the full error object with request ID, method, path, and status.
- The logged path is `req.path`, not the full URL with query string.
- The error response in production returns a generic message and request ID rather than the underlying exception message.
- Some auth, mail, and background-worker paths also use `console.error`/logger calls.

### Assessment

No explicit logging of passwords, JWTs, raw verification/reset tokens, authorization headers, or environment-variable values was found in the reviewed paths. However, the logger has no centralized field-redaction policy. Full third-party/ORM/network error objects may contain implementation details, so the remaining error call sites should be checked before claiming that all sensitive fields are excluded.

Do not add broad object serialization or request-body logging. If redaction is introduced, add tests using sentinel values for passwords, cookies, bearer tokens, database URLs, and mail-provider credentials.

## 2. Proxy topology and rate-limit identity

### Source finding

The API currently sets:

```js
app.set('trust proxy', 1);
```

The standard and auth limiters use Express's `req.ip` by default. The user-or-IP limiter also falls back to `req.ip` for unauthenticated requests.

Express documents that numeric `trust proxy` settings assume a known hop count and warns that paths with different hop counts can allow client-supplied forwarding values to influence the result:
https://expressjs.com/en/guide/behind-proxies/

Current Railway staff responses in public support discussions recommend `X-Real-IP` for public-edge client IP identity, state that the public edge overwrites it, and warn that `X-Forwarded-For` has no fixed hop count. The same responses warn that private-network requests bypass the public edge and can supply their own forwarding headers. They also state that the immediate proxy peer addresses are not a stable allowlist:
https://station.railway.com/questions/need-authoritative-client-ip-proxy-tru-090eac86
https://station.railway.com/questions/supported-client-ip-trust-boundary-for-f-0e4c52d9

### Assessment

The current one-hop `req.ip` assumption is not sufficiently evidenced for the deployed topology. Depending on the actual header chain, it may key limits on an infrastructure hop rather than the end user. It may also be unsafe for requests arriving over private networking if those callers can reach the API listener and supply forwarding headers.

Do not change `trust proxy` to `true`, increase the hop count, or trust a guessed Railway CIDR. A safe fix requires confirming all paths to the API listener and choosing a client-IP source only within a verified trust boundary. The source review alone cannot establish whether the API is reachable by other services over `*.railway.internal` or through a TCP proxy.

### Required evidence

- Confirm whether any other service in the same Railway environment calls the API through its private hostname.
- Confirm whether a TCP proxy is enabled.
- Capture a non-production request at the API that records only the socket peer, `X-Real-IP`, `X-Forwarded-For`, and resulting `req.ip`; do not log cookies, authorization headers, or request bodies.
- Compare normal and deliberately forged forwarding headers sent through the public edge.
- Test the chosen key generator against both public and private ingress paths before changing production.

## 3. Vercel/API URL configuration

- Frontend source repeatedly reads `NEXT_PUBLIC_API_URL`, with a local `http://localhost:5000` fallback.
- Backend `FRONTEND_URL` is used by CORS/origin policy and email-link generation.
- The backend production startup requires `FRONTEND_URL`.
- The repository has no committed `vercel.json`, frontend `.env.example`, or `next.config.js` at the inspected paths.
- A prior environment review recorded a production URL-valued Vercel variable but did not establish its exact name/scope.

### Required evidence

Confirm in Vercel project settings, by name and scope only, that `NEXT_PUBLIC_API_URL` is set for Production and points to the intended Railway API base URL. Check Preview and Development scopes separately if those deployments are used. Do not paste the variable value into chat; a redacted host or simple “correct / incorrect” confirmation is sufficient.

Confirm that the Railway API's `FRONTEND_URL` is the canonical production frontend origin and that preview origins are not accidentally allowed in production.

## 4. Completion criteria

Phase 21.11.5 remains open until:

1. All error-logging call sites in auth, media, AI, and worker paths have been reviewed for secret-bearing error fields.
2. Railway ingress paths and client-IP trust assumptions are verified.
3. Rate-limit behavior is tested with public-edge and any private service traffic.
4. Vercel production `NEXT_PUBLIC_API_URL` name/scope and backend `FRONTEND_URL` are confirmed without disclosing values.
5. Any resulting code/configuration change has tests and a separate approval before production rollout.

No proxy, rate-limit, logging, or Vercel environment changes were made in this phase.
