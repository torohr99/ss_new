# Phase 21.11.3 — Post privacy and media authorization

## Scope

Implement an account-level post visibility preference that applies to all posts, including older posts, and enforce it in the backend and image-delivery path.

## Privacy policy

- `FRIENDS_ONLY` is the database default for existing and new accounts.
- `PUBLIC` makes posts visible to other authenticated accounts.
- Authors can always view their own posts.
- Accepted friends can view either privacy setting.
- A block in either direction overrides friendship and public visibility.
- Profile images remain separate from post privacy and retain the existing broadly visible profile-image behavior.
- The application currently has no general spam/suspension status field. Authentication is required for post feeds and protected post-image retrieval; this change does not invent a spam score or moderation status.

## Implemented in this branch

- Added `User.postPrivacy` to both Prisma schemas with default `FRIENDS_ONLY`.
- Added additive PostgreSQL migration `zzzz_20261117120000_add_post_privacy_setting`, including a check constraint restricting values to `FRIENDS_ONLY` and `PUBLIC`.
- Added centralized `canViewPost` authorization helper and unit tests for author, friend, unrelated viewer, public post, block override, missing author, and invalid identifiers.
- Added authenticated account-setting update validation and exposed the setting from `/api/auth/me`.
- Updated the global feed query to include public posts while excluding users blocked in either direction. The friends feed remains limited to the viewer and accepted friends.
- Added post-privacy checks to likes, comment listing, comment creation, and comment deletion.
- Added authenticated `GET /api/media/post/:postId` proxy. It checks current post access on every request and forwards a short-lived signed read request to the Worker.
- Worker requires signed read authorization for `purpose=post`, bound to owner, exact object key, purpose, and expiry. Post responses are `private, no-store` and bypass shared caching.
- Profile-purpose images retain broadly visible delivery, separate from post privacy.
- Updated PostCard to load images through the authenticated API proxy and added a post-privacy selector to Account Settings.
- Added backend privacy tests and Worker adversarial tests to CI.

## Security and compatibility notes

- Raw post-image Worker URLs are not sufficient to retrieve post images after this change.
- The browser does not receive the Worker read token; the API signs it server-side and proxies the image bytes. This avoids exposing a reusable signed image URL in page markup.
- Every protected image request rechecks the post's current privacy and block state, so privacy changes and blocks take effect on the next request.
- The Worker still exposes profile-purpose images as before; profile image privacy is not controlled by `postPrivacy`.
- Existing post images must have R2 custom metadata identifying `ownerId` and `purpose=post`. Objects without correct metadata fail closed. Validate existing object metadata in a non-production environment before rollout.
- Third-party image URLs are not proxied by the new post-image endpoint. The current upload UI stores Worker-managed image URLs; any legacy external post-image URLs require an explicit compatibility decision before release.
- The migration is additive but has not been run against production. Do not deploy the Worker or API, run production migrations, or change production secrets without explicit approval.

## Validation status

- Automated tests and GitHub Actions are pending final completion of this branch.
- Real R2/Worker integration, Photon WASM runtime validation, cache behavior, and deployed end-to-end privacy checks remain required before release.
- This document records implementation progress; it is not a production deployment approval.
