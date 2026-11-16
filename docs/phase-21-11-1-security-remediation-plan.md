# Phase 21.11.1 — Deferred Security Remediation Inventory and Plan

**Status:** Inventory complete; implementation plan established. No application code, production configuration, secrets, or database records were changed in this phase.

**Base commit:** `d768f632c176d338d809007123f29ff51bfa11fe`
**Working branch:** `phase-21-11-deferred-security-remediation`

## 1. Scope and evidence reviewed

The inventory reviewed:

- `SportSmack/backend/routes/auth.js` registration, email verification, forgot-password, and reset-password flows.
- `SportSmack/backend/prisma/schema.prisma` and `schema.postgres.prisma`.
- The existing PostgreSQL initial migration and migration directory.
- Backend package scripts and existing test-file inventory.
- Phase 21.10.4/21.10.6 documented residual security findings.

This is a source-level inventory. It does not claim that production database contents, deployed source provenance, or live token records were inspected.

## 2. Confirmed findings

### 2.1 Email verification tokens

- Registration generates a 32-byte cryptographically random token encoded as 64 hexadecimal characters.
- The raw token is stored in `User.verificationToken`.
- The raw token is sent to the user by email.
- Verification looks up the raw token directly.
- Successful verification clears the token and marks the account verified.
- There is no verification-token expiry column or expiry check.
- If verification email delivery fails, the newly created account is deleted.

**Finding:** The token has strong randomness, but plaintext database storage and the absence of expiration are security weaknesses.

### 2.2 Password-reset tokens

- Forgot-password generates a 32-byte cryptographically random token encoded as 64 hexadecimal characters.
- The raw token is stored in `User.resetPasswordToken`.
- The database expiry is set to one hour after generation.
- Reset lookup requires the raw token to match and `resetPasswordExpires` to be later than the current time.
- Successful reset clears both token and expiry.
- Email-delivery failure also clears both fields.
- The public response is generic for existing and nonexistent email addresses.

**Finding:** Expiration and single-use clearing already exist. The remaining primary weakness is plaintext token storage.

### 2.3 Schema and migration state

- The two Prisma schema files both define the current raw token fields.
- `schema.postgres.prisma` is the PostgreSQL deployment schema source copied to `schema.prisma` by build scripts.
- The initial migration creates the raw token fields. Later migrations are present in the existing migration directory.
- No auth-specific automated test file or matching auth-token test references were found in the inspected backend test files.
- The existing package scripts include smoke/security tests but no dedicated auth-token test script.

**Finding:** The schemas and migration history need a coordinated, forward-only change and targeted regression coverage.

## 3. Target security design

### 3.1 Token generation and storage

Keep generating tokens with `crypto.randomBytes(32).toString('hex')`. Continue sending the original raw token to the user, but store only its SHA-256 digest in the database.

Use one shared, narrowly scoped helper to hash a submitted/generated token consistently. Do not log raw tokens or their hashes.

Recommended final persistence fields:

- `verificationTokenHash String?`
- `verificationTokenExpires DateTime?`
- `resetPasswordTokenHash String?`
- `resetPasswordExpires DateTime?` (retain existing one-hour reset expiry)

Add appropriate database indexes for hash lookups. A uniqueness constraint is optional and should only be added if justified by the actual schema/data review; 256-bit random tokens already make accidental collisions negligible.

The final application must not persist raw verification or reset tokens.

### 3.2 Email verification expiration

Adopt a finite verification-token lifetime of **24 hours** for newly issued links. The route must reject missing, malformed, unknown, expired, and already-used tokens with a generic invalid/expired response.

Successful verification must atomically mark the account verified and clear both the token hash and expiry. Ensure concurrent/replayed requests cannot make a consumed token valid again.

The 24-hour lifetime is a proposed application policy for implementation; it is not a currently configured production behavior.

### 3.3 Password reset

Retain the existing one-hour lifetime. Hash the raw token before lookup. Successful reset must atomically update the password hash and clear the reset-token hash and expiry. Preserve generic forgot-password responses and email-failure invalidation.

Review whether resetting a password should also revoke existing authentication sessions/JWTs. Do not change session behavior without tracing the current auth/session architecture and explicitly documenting the chosen behavior.

## 4. Existing-token migration and rollout safety

Do not simply change the existing columns to contain hashes while old application instances may still be writing or reading raw tokens. Do not assume the current production database has no outstanding tokens.

Phase 21.11.2 must choose and test a backward-compatible rollout before production migration. The preferred direction is an additive transition:

1. Add nullable hash and verification-expiry columns and indexes using a forward-only migration. Keep legacy raw-token columns temporarily so the old deployed application remains schema-compatible.
2. Implement a controlled transition strategy for outstanding legacy tokens. Evaluate a one-time backfill using a trusted application-side SHA-256 migration utility, or an explicitly communicated invalidation/reissue policy. Do not assume a database crypto extension is installed.
3. Account for writes that may occur while migration/backfill is running. A backfill that races with old application writes is not sufficient.
4. Ensure newly deployed code can safely handle the transition and that no mixed-version API replicas can create unusable tokens.
5. Verify the backfill/reissue result and token-expiry policy before removing legacy plaintext fields.
6. In a later forward-only cleanup migration, drop legacy raw-token columns only after all deployed code and outstanding-token handling no longer depend on them.

The migration/backfill must be idempotent or have a documented recovery procedure, preserve user records, and never print token values. Test it against a disposable PostgreSQL database with representative legacy rows before any production use.

**Production safeguards:** no production migration, maintenance window, account/token invalidation, secret change, deployment, or merge is authorized by this planning document. Obtain explicit approval before any such action.

## 5. Required regression tests for Phase 21.11.2

### Email verification

- Valid unexpired token verifies the account.
- Database stores a digest, not the raw token.
- Expired token is rejected.
- Malformed and unknown tokens are rejected.
- Used token cannot be reused.
- Verification clears hash and expiry.
- Email-send failure preserves the existing account-cleanup behavior.
- Concurrent verification requests cannot consume the token more than once.

### Password reset

- Valid unexpired token resets the password.
- Database stores a digest, not the raw token.
- Expired token is rejected.
- Malformed and unknown tokens are rejected.
- Used token cannot be reused.
- Successful reset clears hash and expiry.
- Email-send failure invalidates the token.
- Forgot-password response remains non-enumerating.
- Password validation and bcrypt hashing behavior remain intact.

### Migration and compatibility

- Existing legacy token rows are handled according to the approved transition policy.
- Expired legacy reset tokens are not revived.
- Legacy verification tokens receive a finite, documented grace period or are invalidated with a usable re-verification path.
- Concurrent writes and mixed-version deployment behavior are tested.
- Prisma schema validation, migration application, and generated client checks pass.
- Tests run against disposable/local PostgreSQL; no production database is used.

## 6. Phase 21.11 remaining work

| Phase | Work | Completion evidence |
|---|---|---|
| 21.11.1 | Security inventory and implementation plan | This document reviewed and committed |
| 21.11.2 | Token hashing, expiry, safe migration, and regression tests | Passing tests, schema/migration validation, reviewed PR |
| 21.11.3 | Cloudflare media Worker adversarial and negative testing | Documented positive/negative test matrix and results |
| 21.11.4 | Environment-variable and credential-consumer audit | Every variable mapped to its consumer; removal only after approval |
| 21.11.5 | Error logging, proxy topology, and Vercel URL configuration review | Evidence-based findings and approved fixes |
| 21.11.6 | Security regression, CI validation, documentation, and PR | Green CI and reviewed PR; merge/deploy separately approved |

## 7. Explicit non-goals and change control

Phase 21.11.1 does not:

- Modify application source code or Prisma schemas.
- Create or apply a database migration.
- Read, export, or alter production token records.
- Change production environment variables or credentials.
- Deploy, merge, or modify production infrastructure.
- Certify the application for millions of users or high concurrency.

All implementation changes should be made on the Phase 21.11 branch, reviewed through a pull request, and validated in non-production environments first.


## 8. Production migration workflow safeguard (Phase 21.11.2)

The existing `.github/workflows/prisma-migrate.yml` originally ran automatically whenever migration files were pushed to `main`. That behavior could apply a production database migration as a side effect of merging a pull request, without a separate migration approval.

On the Phase 21.11.2 branch, the workflow has been changed to:

- Run only through an explicit `workflow_dispatch`.
- Require a deliberate `yes` selection for the production-migration confirmation input; the default is `no`.
- Serialize production migration runs so two migration jobs cannot overlap.
- Use read-only repository permissions.

This workflow change does not run a migration, connect to the production database, or alter production data. It removes automatic migration execution on merge. A manually dispatched production migration remains a separate action and must not be run without explicit approval and prior non-production validation.


## 9. Phase 21.11.2 implementation progress

The feature branch now contains the additive token-hash schema/migration, shared token utility, transitional auth-route changes, a legacy-token backfill utility, a resend-verification endpoint/UI, and helper/route regression tests. The implementation details and staged rollout are recorded in `docs/phase-21-11-2-auth-token-hardening-implementation.md`.

The transitional application intentionally dual-writes raw tokens and hashes so older API replicas can continue to verify tokens during the first deployment. Therefore, plaintext token removal is **not complete**. A second rollout must stop plaintext writes, followed by an approved cleanup of remaining raw values and a later migration that removes the legacy columns.

The migration workflow is now manual-only and requires an explicit confirmation input. No migration or production backfill has been run. Phase 21.11.2 remains open until CI, disposable-PostgreSQL migration/backfill tests, and rollout review pass.
