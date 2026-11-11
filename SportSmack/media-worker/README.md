# SportSmack media Worker

This Worker stores original images in the private `sportsmack-media` R2 bucket and serves resized WebP variants. It uses the open-source `@cf-wasm/photon` WebAssembly library; it does not use the paid Cloudflare Images binding or require a custom domain.

## Cloudflare setup

1. The R2 bucket must be named `sportsmack-media`.
2. The Worker configuration binds it as `MEDIA_BUCKET`.
3. Configure the account's `workers.dev` subdomain.
4. From this directory, install dependencies and authenticate Wrangler:
   ```sh
   npm install
   npx wrangler login
   ```
5. Generate a shared upload-signing secret locally with Node.js:
   ```sh
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```
   Keep the generated value private. Do not commit it or send it in chat.
6. Store the value as a Worker secret:
   ```sh
   npx wrangler secret put MEDIA_UPLOAD_SECRET
   ```
   Paste the generated value at the prompt.
7. Validate the bundle and deploy:
   ```sh
   npx wrangler deploy --dry-run
   npx wrangler deploy
   ```
8. Confirm the Worker health endpoint returns `{"status":"ok","service":"sportsmack-media"}`:
   ```
   https://sportsmack-media.<your-workers-subdomain>.workers.dev/health
   ```

## Railway API environment

Set these variables on the **SportSmack API service only**:

- `MEDIA_WORKER_URL`: the deployed Worker base URL, without a trailing slash.
- `MEDIA_UPLOAD_SECRET`: exactly the same secret stored with `wrangler secret put`.

No R2 access key, secret access key, Cloudflare account ID, or hosted Images delivery hash is required by the application. The Worker accesses R2 through its bucket binding.

## Upload and delivery behavior

- Upload authorization is issued by the authenticated backend for a single object key and expires after five minutes.
- The Worker accepts JPEG, PNG, and WebP only, verifies file signatures, and caps uploads at 5 MiB.
- Objects are stored under `<userId>/<uuid>.<extension>`.
- Public delivery supports `?variant=avatar` (256px maximum), `?variant=thumbnail` (640px maximum), and `?variant=post` (1200px maximum).
- Transformed output is WebP and cached with immutable cache headers.
- Delete authorizations are signed by the backend and only permit deletion of the authenticated user's own image. The API retains images still referenced by a post or profile.
- The bucket is not made publicly accessible; all reads pass through this Worker.

## Important operational note

The Worker performs image decoding and resizing in WebAssembly. Keep the 5 MiB upload limit and run the upload/delivery tests before enabling the feature for all users. Monitor Worker CPU, memory, and errors as usage increases.
