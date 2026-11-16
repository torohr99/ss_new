# Phase 21.10.4 — Production Security and Configuration Audit

Status: In progress  
Branch: `phase-21-10-4-production-security-audit`  
Base: `phase-21-10-3-api-worker-deployment-recovery`

## Scope

Audit production configuration and security controls without changing production services or exposing credentials.

## Initial remediation

- [x] Centralize browser-origin validation for CORS and CSRF.
- [x] Permit localhost and the known Vercel preview pattern only outside production.
- [x] Require the configured `FRONTEND_URL` for the production browser origin.
- [x] Add regression tests for production and development origin behavior.
- [x] Add the regression test to GitHub Actions on this branch.

## Audit checklist

- [ ] Inventory production API and worker environment variable names; do not record values.
- [ ] Inventory Vercel environment variable names and deployment scopes; do not record values.
- [ ] Verify JWT secret strength, rotation procedure, and absence from repository history.
- [ ] Verify production cookie flags, domain, SameSite behavior, and logout symmetry.
- [ ] Review authentication, password reset, email verification, and account enumeration behavior.
- [ ] Verify Express proxy trust against the actual Railway ingress topology.
- [ ] Verify rate limits and the `LOAD_TEST_SECRET` bypass policy.
- [ ] Review Helmet, CORS, CSRF, TLS, and frontend security headers.
- [ ] Review upload validation, file storage permissions, and resource limits.
- [ ] Review logging for tokens, passwords, personal data, and secret leakage.
- [ ] Review dependency audit results and lockfile reproducibility.
- [ ] Run backend security regression tests and frontend production build.
- [ ] Document findings, severity, remediation, and accepted residual risks.

## Findings requiring follow-up

1. Production CORS and CSRF previously included localhost origins. Initial remediation now makes local origins development-only and shares one origin policy between both middleware layers.
2. Express proxy trust is hard-coded to one hop and has a stale Render-specific comment. Confirm Railway's actual proxy chain before changing this setting.
3. The standard rate limiter supports a header-based load-test bypass when `LOAD_TEST_SECRET` is configured. Verify the variable is absent in production or is tightly controlled and never exposed to clients.
4. Production startup currently validates a subset of environment variables. Complete the runtime dependency inventory before expanding validation.
5. Login cookies use `SameSite=None` in production. Verify the cross-site frontend/API deployment requirement and the associated CSRF controls before changing cookie behavior.

## Guardrails

- No production variable edits, credential rotation, database migrations, or deployments without explicit approval.
- Never print or commit secret values.
- Do not claim an audit item is complete without evidence.
