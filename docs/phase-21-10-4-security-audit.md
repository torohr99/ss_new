# Phase 21.10.4 — Production Security and Configuration Audit

Status: **Complete — verified controls documented; residual risks explicitly carried forward**  
Branch: `phase-21-10-4-production-security-audit`  
Audited code commit: `314870696cf6326f0e001470302a9908268f788c`  
Audit documentation commit: `f9898740f7c10bcc1e8d3c4303f456b8b1cee2cb`

## Scope and guardrails

Audit production security controls and configuration without changing production services. No production deployment, merge, secret rotation, environment-variable edits, or database migration was performed as part of this phase.

## Completed controls and evidence

- [x] Centralized browser-origin validation for CORS and CSRF.
- [x] Limited localhost and known Vercel preview origins to non-production; production requires the configured `FRONTEND_URL`.
- [x] Added regression tests for production and development origin behavior.
- [x] Verified live production CORS behavior: the configured frontend origin receives the matching allow-origin and credentials headers; an unauthorized origin receives no allow-origin permission.
- [x] Verified live preflight behavior: the configured origin receives 204 and expected CORS headers; an unauthorized origin receives no CORS permission.
- [x] Restricted the standard rate-limit load-test bypass to development/test only. Production cannot bypass the limiter using the configured secret/header.
- [x] Added regression tests for production bypass denial, development/test bypass, incorrect/missing secret, and the dependency-status exemption.
- [x] Enforced a minimum 32-byte JWT secret before authentication routes initialize.
- [x] User privately confirmed the production JWT secret is unique to SportSmack, randomly generated, and at least 32 bytes. No value was disclosed.
- [x] Bounded password-reset submissions to 8–128 characters.
- [x] Removed recipient email addresses from successful email-delivery logs.
- [x] Confirmed password-reset tokens expire after one hour, are invalidated after use, and failed email delivery clears the token.
- [x] Confirmed login/logout cookie attributes match: HttpOnly, production Secure, matching SameSite, and path=/.
- [x] Confirmed previous backend and frontend dependency audits returned zero vulnerabilities, including development dependencies.
- [x] Confirmed reviewed production frontend/backend responses include the expected TLS and security headers.
- [x] Reviewed the Cloudflare media Worker implementation in this repository: signed upload authorization, expiry checks, user-scoped object keys, content-type and file-signature checks, upload-size limits, and ownership checks for deletion and delivery.
- [x] User confirmed the `sportsmack-media` Worker is deployed, has `MEDIA_UPLOAD_SECRET` configured as a secret, and profile/social image uploads have succeeded.
- [x] User confirmed public access is disabled on the `sportsmack-media` R2 bucket. The Worker uses an R2 bucket binding, so public bucket access is not required for Worker-served images.
- [x] Confirmed the separate Railway database-backup service has the expected variable names: `AGE_RECIPIENT`, `AWS_ACCESS_KEY_ID`, `AWS_DEFAULT_REGION`, `AWS_SECRET_ACCESS_KEY`, `DATABASE_URL`, `R2_BUCKET`, and `R2_ENDPOINT`.
- [x] Kept all work isolated to this branch; no production deployment, merge, secret rotation, environment edits, or database migration.

## Configuration inventory (names only; no values recorded)

- **Railway API:** user confirmed `MEDIA_WORKER_URL`, `MEDIA_UPLOAD_SECRET`, `JWT_SECRET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `SPORTSMACK_DATABASE_BACKUPS_ACCESS_KEY_ID`, and `SPORTSMACK_DATABASE_BACKUPS_SECRET_ACCESS_KEY`.
- **Cloudflare media Worker:** user confirmed `MEDIA_UPLOAD_SECRET` is configured as a Worker secret; the `MEDIA_BUCKET` binding targets the private `sportsmack-media` bucket.
- **Railway database-backup service:** user confirmed the seven expected variables listed above.
- **Vercel:** a production URL-valued variable was previously observed, but its exact variable name and scope were not confirmed during this audit.
- No variable values, credentials, tokens, or secret material are recorded here.

## Residual risks accepted for follow-up (not blockers to closing this audit)

1. **Unneeded/legacy API credentials:** repository code search did not identify references to the four API-side R2/backup credential names. The backup script instead consumes `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` on the separate backup service, and the media Worker uses its R2 binding. These API variables are therefore likely legacy or unused, but were deliberately left untouched. Confirm any external consumers and remove them in a separately approved configuration change.
2. **Proxy topology:** Express currently trusts one proxy hop. The code comment now describes a hosting proxy rather than naming the former host, but the exact Railway ingress chain was not independently established. Keep the current setting; verify topology before changing the hop count.
3. **Email verification token lifecycle:** verification tokens are random and single-use, but the database model does not currently enforce a verification-token expiry timestamp. Verification/reset tokens are stored in the database in recoverable form. Consider adding expiry and token hashing at rest in a separately planned change requiring schema migration and rollout.
4. **Logging review:** recipient addresses were removed from successful delivery logs. Error objects/stacks are still retained for diagnostics. Continue reviewing provider/database error payloads to ensure they cannot contain credentials, cookies, JWTs, raw tokens, or request bodies.
5. **Vercel variable identification:** exact name and production scope of the URL-valued variable were not confirmed. Verify during the next configuration review.
6. **Media authorization adversarial tests:** Worker source and normal upload operation were reviewed/confirmed, but a separate live negative-test campaign (expired token, cross-user key, invalid image bytes, oversized upload, unauthorized delete) was not performed. Add automated Worker tests or run controlled staging tests before a broader security certification.

## Final validation evidence

- [x] Local JavaScript syntax checks and origin/rate-limit security regression tests passed; output: `ALL ORIGIN AND RATE-LIMIT POLICY TESTS PASSED`.
- [x] GitHub Actions run `43885340852` for code commit `314870696cf6326f0e001470302a9908268f788c` completed successfully. Backend checks and frontend lint/build jobs both passed.
- [x] The closing commit changes only this audit documentation; it does not alter application code, dependencies, tests, or deployment configuration. The successful CI run above validates the audited code commit.

## Sign-off

Phase 21.10.4 is complete as a production security/configuration audit with the residual risks above explicitly recorded for follow-up. Completion does **not** certify the application as penetration-tested, authorize production deployment, or establish capacity for any particular user/concurrency target.

## Guardrails

- No production variable edits, credential rotation, database migrations, merges, or deployments without explicit approval.
- Never print or commit secret values.
- Do not claim an audit item is complete without evidence.
