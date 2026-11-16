# Phase 21.11.3 — Cloudflare Media Worker Adversarial Review

**Status:** Source review and initial negative-test implementation complete; automated execution and deployed-Worker verification pending.

## Scope

Reviewed:

- `SportSmack/media-worker/src/index.js`
- `SportSmack/media-worker/wrangler.jsonc`
- `SportSmack/media-worker/package.json`
- `SportSmack/backend/routes/media.js`
- `SportSmack/backend/services/mediaUrls.js`
- `SportSmack/media-worker/README.md`

No Cloudflare deployment, secret change, R2 data change, or production request was performed.

## Findings and changes

### 1. Upload replay race — fixed in source

The previous upload handler called `MEDIA_BUCKET.head(key)` and then separately called `put(key, ...)`. Two concurrent requests could both observe an absent object and then both write the same key.

The handler now uses the R2 conditional write `onlyIf: { etagDoesNotMatch: '*' }`. A failed condition returns the existing 409 single-use response. Cloudflare documents that conditional R2 writes are evaluated atomically at commit and serialize competing writes to an absent key:

- https://developers.cloudflare.com/r2/api/workers/workers-api-reference/
- https://developers.cloudflare.com/r2/reference/consistency/

### 2. Authorization input hardening — fixed in source

- Reject non-string or oversized (over 4096 characters) upload authorization values.
- Require a positive safe-integer user ID and a safe-integer expiry timestamp.
- Reject tokens whose expiry is equal to or earlier than the current time.
- Handle malformed percent-encoding in upload, delete, and image paths without an uncaught URI decoding exception.

### 3. Existing controls reviewed

The Worker already:

- Verifies an HMAC-SHA-256 signature before trusting token payload fields.
- Binds upload authorization to one object key and user namespace.
- Checks the exact authorized content type and image file signature.
- Enforces the 5 MiB limit both from the declared length and while reading the request body.
- Uses a private R2 bucket binding and validates object ownership metadata before image delivery.
- Requires a signed delete authorization for deletion.

These are source-level observations, not a claim that the deployed Worker has been tested against every case.

## Automated tests added

A Node built-in test suite now covers:

- Health response.
- Missing, malformed, and oversized authorization.
- Expired authorization.
- Signed-key mismatch and user-namespace mismatch.
- Malformed percent-encoding.
- Content-type mismatch.
- Declared upload-size violation.
- Invalid image signature.
- Successful upload and ownership metadata.
- Sequential replay.
- Concurrent replay against an atomic conditional-write test double.
- Allowed and disallowed CORS origins.

The Worker package now exposes `npm test`. CI installs the Worker dependencies, runs this test suite, and runs the Wrangler production-bundle dry run.

**Important limitation:** the fake R2 bucket tests validate the Worker's handling of conditional-write success/failure. They do not substitute for a staging test against a real Cloudflare R2 binding.

## Open security/design items requiring validation

### A. Public image delivery versus private storage

The R2 bucket is private, but the Worker's image GET handler does not require authentication. Anyone who knows an image URL/key can request the image through the Worker. This may be the intended model for public social posts and profile pictures, but a private bucket alone does not make the delivered images private.

Before closing this phase, confirm that public-by-URL delivery is intended for all stored profile and post images. If some images must be private, they need authenticated or signed read authorization rather than relying on the private R2 bucket setting.

### B. Global cache invalidation after deletion

The Worker caches transformed images for up to one year and calls `caches.default.delete()` for each variant when deleting an object. Cloudflare documents that Cache API `delete()` only purges the data center in which the Worker invocation runs; it does not globally purge other data centers:

- https://developers.cloudflare.com/workers/runtime-apis/cache/
- https://developers.cloudflare.com/workers/reference/how-the-cache-works/

Therefore, a deleted image may remain available from another data center's Cache API for its remaining cache lifetime. This does not expose the R2 bucket itself, but it can delay effective deletion of a previously cached public image.

Before changing cache behavior, choose and test one of:
- A short maximum cache lifetime that bounds stale availability after deletion.
- A supported global cache-purge/invalidation mechanism with appropriately scoped credentials and tests.

Do not claim immediate global deletion with the current local Cache API invalidation.

### C. Remaining negative tests

Before marking 21.11.3 complete, extend or execute tests for:
- Delete: missing/invalid/expired token, wrong action, mismatched key, cross-user key, successful delete, and cache invalidation.
- Image delivery: malformed path, invalid variant, missing object, mismatched ownership metadata, corrupt/oversized stored image, and successful resize.
- Real R2 conditional writes under concurrent requests.
- Cross-data-center deletion/cache behavior.
- Worker behavior when the R2 binding or signing secret is unavailable.

## Completion criteria

Do not mark Phase 21.11.3 complete until the CI test suite and Wrangler dry run pass, the public-image access model is confirmed, cache deletion semantics have an approved and tested resolution, and the staging-only R2 tests pass. Production deployment remains separately gated and unauthorized by this document.
