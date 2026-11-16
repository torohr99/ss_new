# Phase 21.10.4 — Production Security and Configuration Audit

Status: In progress — code remediations implemented; final CI and residual-risk review pending  
Branch: `phase-21-10-4-production-security-audit`  
Base: `phase-21-10-3-api-worker-deployment-recovery`

## Scope

Audit production configuration and security controls without changing production services or exposing credentials.

## Completed controls and evidence

- [x] Centralize browser-origin validation for CORS and CSRF.
- [x] Permit localhost and the known Vercel preview pattern only outside production.
- [x] Require the configured `FRONTEND_URL` for the production browser origin.
- [x] Add regression tests for production and development origin behavior.
- [x] Add the regression test to GitHub Actions on this branch.
- [x] Verify live production CORS behavior: configured frontend origin receives matching allow-origin and credentials headers; unauthorized origin receives no allow-origin header.
- [x] Verify live preflight behavior: configured origin receives 204 and expected CORS headers; unauthorized origin receives no CORS permission and falls through to the route's normal response.
- [x] Confirm backend and Worker use the expected `DATABASE_URL` variable name.
- [x] Restrict the standard rate-limit load-test bypass to development/test only; production cannot bypass it even with the configured secret and matching header.
- [x] Add regression tests for production rate-limit bypass denial, development/test bypass, incorrect/missing secret, and the dependency-status exemption.
- [x] Validate JWT secret configuration has at least 32 bytes before auth routes initialize. This enforces a minimum length, not proof of randomness or rotation history.
- [x] Bound password-reset submissions to the same 8–128 character range as registration.
- [x] Remove recipient email addresses from email-delivery success logs.
- [x] Confirm password-reset tokens expire after one hour, are invalidated after use, and failed email delivery clears the token.
- [x] Confirm login and logout cookie attributes match: HttpOnly, production Secure, matching SameSite, and path=/.
- [x] Confirm dependency audits previously returned zero vulnerabilities for backend and frontend, including development dependencies.
- [x] Confirm production frontend/backend responses include the reviewed TLS and security headers.
- [x] Keep all changes isolated to this branch; no production deployment, merge, secret rotation, environment edits, or database migration.

## Configuration inventory (names only)

- API service: user confirmed the expected backend variables are present, including `DATABASE_URL`, `FRONTEND_URL`, `JWT_SECRET`, `LOAD_TEST_SECRET`, `MEDIA_UPLOAD_SECRET`, and `MEDIA_WORKER_URL`. Several platform/runtime variables are also present.
- Worker service: user confirmed `DATABASE_URL`, `FRONTEND_URL`, `JWT_SECRET`, `LOAD_TEST_SECRET`, `REDIS_URL`, mail-provider settings, and the worker startup flags are present.
- Vercel: one production URL-valued variable is present; its name has not been independently confirmed and is believed to be `NEXT_PUBLIC_API_URL`.
- No variable values are recorded here.

## Remaining verification / residual risks

1. **JWT secret quality and history:** minimum 32-byte enforcement is now in code. The secret's actual randomness, uniqueness, rotation procedure, and absence from all historical commits/other systems must be checked privately in the hosting dashboard and repository secret scanning. Never paste the value into chat or commit it.
2. **Email verification token lifecycle:** tokens are cryptographically random and single-use, but the current database model has no verification-token expiry timestamp. Add an expiry and consider hashing verification/reset tokens at rest in a later controlled change. No schema migration is included in this audit branch.
3. **Media storage worker:** API-side upload authorizations are scoped to the authenticated user's object key, supported image MIME types, and a five-minute expiry; deletion is ownership-checked and avoids deleting referenced media. The Cloudflare media Worker implementation and its bucket/public-access rules are external to this repository and have not been independently audited. Verify signature/expiry enforcement, actual file-content sniffing, size limits, key-prefix restrictions, and bucket access policy before production sign-off.
4. **Proxy trust:** Express trusts one proxy hop. Production responses show Railway ingress headers, but the exact trusted proxy chain has not been independently established. Do not change the hop count until Railway topology is confirmed. The adjacent comment still references Render and should be corrected.
5. **Logging:** email recipient addresses have been removed from successful delivery logs. Error objects/stacks remain in server logs for diagnosis; continue to ensure no request bodies, credentials, cookies, JWTs, or raw reset/verification tokens are logged.
6. **Environment scope:** API/Worker variable names were inventoried from the user's dashboard review. Verify production vs preview/development scopes and remove unused legacy variables only after code references and service dependencies are confirmed.
7. **Vercel variable name:** confirm the exact name and production scope in Vercel; the value alone is not conclusive evidence of its name.

## Final validation

- [x] Local JavaScript syntax checks for rate-limit middleware and policy.
- [x] Local origin/rate-limit regression suite passed: `ALL ORIGIN AND RATE-LIMIT POLICY TESTS PASSED`.
- [ ] Final GitHub Actions run for the latest commit succeeds, including backend checks, security tests, Prisma generation, frontend lint, and frontend production build.
- [ ] User confirms the remaining residual risks are understood; no production deployment or merge is implied by this audit.

## Guardrails

- No production variable edits, credential rotation, database migrations, or deployments without explicit approval.
- Never print or commit secret values.
- Do not claim an audit item is complete without evidence.
