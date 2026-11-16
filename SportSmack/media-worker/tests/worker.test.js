import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import worker from '../src/index.js';

const SECRET = 'test-only-media-upload-secret-that-is-long-enough';
const KEY = '42/123e4567-e89b-12d3-a456-426614174000.png';
const ORIGIN = 'https://ss-new-backendfromr.vercel.app';
const PNG_SIGNATURE = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
]);

function signedToken(overrides = {}) {
  const payload = {
    userId: 42,
    key: KEY,
    purpose: 'post',
    contentType: 'image/png',
    expiresAt: Date.now() + 60_000,
    ...overrides
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', SECRET)
    .update(encoded)
    .digest('base64url');
  return encoded + '.' + signature;
}

function createBucket() {
  const objects = new Map();

  return {
    objects,
    async put(key, value, options = {}) {
      if (
        options.onlyIf?.etagDoesNotMatch === '*' &&
        objects.has(key)
      ) {
        return null;
      }

      objects.set(key, {
        bytes: new Uint8Array(value),
        options
      });
      return { key };
    },
    async head(key) {
      return objects.has(key) ? { key } : null;
    }
  };
}

function makeEnv(bucket = createBucket()) {
  return {
    MEDIA_UPLOAD_SECRET: SECRET,
    ALLOWED_ORIGINS: ORIGIN,
    MEDIA_BUCKET: bucket
  };
}

function uploadRequest({
  token = signedToken(),
  key = KEY,
  bytes = PNG_SIGNATURE,
  contentType = 'image/png',
  origin = ORIGIN,
  contentLength
} = {}) {
  const headers = {
    Authorization: 'Bearer ' + token,
    'Content-Type': contentType,
    Origin: origin
  };

  if (contentLength !== undefined) {
    headers['Content-Length'] = String(contentLength);
  }

  return new Request('https://media.test/upload/' + key, {
    method: 'PUT',
    headers,
    body: bytes
  });
}

async function upload(options = {}, env = makeEnv()) {
  return worker.fetch(uploadRequest(options), env, {});
}

test('health endpoint responds without exposing configuration', async () => {
  const response = await worker.fetch(
    new Request('https://media.test/health'),
    makeEnv(),
    {}
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: 'ok',
    service: 'sportsmack-media'
  });
});

test('upload rejects missing or malformed authorization', async () => {
  const response = await upload({ token: 'not-a-signed-token' });
  assert.equal(response.status, 401);
});

test('upload rejects expired authorization', async () => {
  const response = await upload({
    token: signedToken({ expiresAt: Date.now() - 1 })
  });
  assert.equal(response.status, 401);
});

test('upload rejects a token bound to a different object key', async () => {
  const response = await upload({
    key: '42/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png'
  });
  assert.equal(response.status, 401);
});

test('upload rejects a token whose object key belongs to another user', async () => {
  const response = await upload({
    token: signedToken({
      userId: 43,
      key: '43/123e4567-e89b-12d3-a456-426614174000.png'
    })
  });
  assert.equal(response.status, 401);
});

test('upload rejects a mismatched content type', async () => {
  const response = await upload({ contentType: 'image/jpeg' });
  assert.equal(response.status, 415);
});

test('upload rejects content exceeding the declared size limit', async () => {
  const response = await upload({ contentLength: 5 * 1024 * 1024 + 1 });
  assert.equal(response.status, 413);
});

test('upload rejects bytes that do not match the authorized image type', async () => {
  const response = await upload({
    bytes: Uint8Array.from([0x00, 0x01, 0x02, 0x03])
  });
  assert.equal(response.status, 415);
});

test('successful upload stores ownership metadata and returns the object key', async () => {
  const bucket = createBucket();
  const response = await upload({}, makeEnv(bucket));

  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.key, KEY);
  assert.equal(body.imageUrl, 'https://media.test/' + KEY);

  const stored = bucket.objects.get(KEY);
  assert.ok(stored);
  assert.deepEqual(stored.options.customMetadata, {
    ownerId: '42',
    purpose: 'post'
  });
  assert.equal(stored.options.httpMetadata.contentType, 'image/png');
  assert.equal(stored.options.onlyIf.etagDoesNotMatch, '*');
});

test('a sequential replay of the same upload authorization is rejected', async () => {
  const bucket = createBucket();
  const env = makeEnv(bucket);
  const token = signedToken();

  const first = await upload({ token }, env);
  const second = await upload({ token }, env);

  assert.equal(first.status, 201);
  assert.equal(second.status, 409);
  assert.equal(bucket.objects.size, 1);
});

test('concurrent replays cannot overwrite the same object when R2 enforces the conditional write', async () => {
  const bucket = createBucket();
  const env = makeEnv(bucket);
  const token = signedToken();

  const responses = await Promise.all([
    upload({ token }, env),
    upload({ token }, env)
  ]);
  const statuses = responses.map(response => response.status).sort();

  assert.deepEqual(statuses, [201, 409]);
  assert.equal(bucket.objects.size, 1);
});

test('CORS reflects only an explicitly configured origin', async () => {
  const allowed = await upload({}, makeEnv());
  assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), ORIGIN);

  const denied = await upload(
    { origin: 'https://attacker.example' },
    makeEnv()
  );
  assert.equal(denied.headers.get('Access-Control-Allow-Origin'), null);
});
