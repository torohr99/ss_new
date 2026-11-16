# Phase 21.11.2 — Authentication Token Hardening Implementation

**Status:** Implementation added to the feature branch; automated CI and disposable-PostgreSQL validation pending. Production migration, deployment, backfill, and merge have not been run or approved.

## 1. Additive database change

The PostgreSQL Prisma schema and the secondary Prisma schema now include:

- `verificationTokenHash` (nullable, unique)
- `verificationTokenExpires` (nullable)
- `resetPasswordTokenHash` (nullable, unique)

A forward-only migration adds these three nullable columns and unique indexes. Existing plaintext columns are intentionally retained. The migration does not update or delete user data and does not change current application behavior until the new code is deployed.

## 2. Token utility and behavior

`backend/lib/authTokenSecurity.js` centralizes:

- 32-byte cryptographically secure token generation (64 lowercase hex characters).
- Strict token-format validation.
- SHA-256 token hashing.
- 24-hour verification-token expiry.
- One-hour password-reset-token expiry.

New registration and password-reset tokens are stored in both the existing plaintext column and the new hash column during the compatibility rollout. The email still receives the raw token. Hashes are preferred for lookup; plaintext fallback is retained temporarily so older application replicas and pre-migration outstanding tokens remain usable during rollout.

**This is a transitional state, not the final hash-only state.** Do not claim that plaintext tokens have already been eliminated from the database.

## 3. Verification and reset behavior

- New verification links expire after 24 hours.
- Password-reset links retain the existing one-hour expiry.
- Malformed tokens are rejected before database lookup.
- Verification uses a conditional `updateMany` to atomically mark the account verified and consume the token.
- Password reset uses a conditional `updateMany` to atomically change the password and consume the token.
- Concurrent requests can consume a given token only once.
- Successful consumption clears the plaintext token, hash, and expiry.
- Email-delivery failure invalidates the newly generated token.
- A non-enumerating `POST /api/auth/resend-verification` endpoint and verification-page form allow an unverified user to request a fresh link after expiration. The public response does not reveal whether an email is registered or already verified.



### Email-action abuse protection

The forgot-password and resend-verification endpoints also use a dedicated Redis-backed limit of three requests per normalized email address per hour. The Redis key contains a SHA-256 digest of the normalized email, not the raw email address. This avoids relying solely on the auth limiter, which intentionally skips successful responses and therefore would not constrain the generic-success resend endpoint.

## 4. Legacy-token backfill utility

`backend/scripts/backfillAuthTokenHashes.js` is an idempotent, batched application-side backfill. It:

- Hashes valid legacy verification and reset tokens without printing token values.
- Gives pre-migration verification links a 24-hour grace period from the backfill time only when they do not already have an expiry.
- Preserves the existing reset expiry exactly; expired or expiry-less reset tokens are not revived.
- Uses conditional updates so concurrent token changes are not overwritten.
- Leaves plaintext columns intact for compatibility.
- Prints counts only and can be run again to catch writes made during a rollout.

Command: `npm run tokens:backfill`.

Do not run this against production without explicit approval. Validate it first against a disposable PostgreSQL database containing representative legacy rows.

## 5. Rollout sequence — required

The code and migration are not safe to deploy in an arbitrary order. Use this sequence only after explicit approval:

1. Validate the additive migration on disposable PostgreSQL and verify the generated Prisma client.
2. Apply the additive production migration through the now-manual Prisma migration workflow only after separate approval.
3. Deploy the transitional application code that dual-reads and dual-writes.
4. Wait until every API replica is running the transitional code; do not assume a rolling deploy has completed.
5. Run `npm run tokens:backfill` against the intended database after the transitional code is fully deployed.
6. Review only aggregate counts. Rerun the backfill after the rollout window to catch any legacy writes; do not export token values.
7. In a later, separately reviewed code change, stop writing plaintext tokens while retaining hash-first and temporary legacy fallback reads. Because transitional code can read hash-only tokens, this change can be rolled out without old pre-transition code remaining.
8. After all replicas run hash-only writes and all legacy records are backfilled, clear remaining plaintext values. Only then prepare a separate migration to drop legacy plaintext columns and remove legacy fallback reads.

The current branch implements steps 1, 3, and the backfill utility. It does not apply the migration, deploy, backfill production, clear production token values, or drop legacy columns.

## 6. Regression tests added

- Helper tests for token generation, format validation, deterministic SHA-256 hashing, and expiry durations.
- Route tests using an in-memory Prisma test double for hash-only verification/reset, legacy compatibility, malformed/expired tokens, single-use consumption, and concurrent verification/reset requests.
- Resend-verification tests for fresh token generation and non-enumerating responses.
- Backend CI runs the auth-token test suite.

The tests still need to execute successfully in GitHub Actions. The route tests use a test double; they do not replace disposable-PostgreSQL migration/backfill validation.

## 7. Explicit exclusions

No production migration, production token backfill, production environment change, deployment, credential rotation, or merge was performed. Legacy plaintext token columns remain in the schema and database until a later approved cleanup phase.
