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
    },
    async delete(key) {
      objects.delete(key);
    },
    async get(key) {
      const stored = objects.get(key);
      if (!stored) return null;
      return {
        customMetadata: stored.options.customMetadata,
        httpEtag: 'test-etag',
        async arrayBuffer() {
          return stored.bytes.buffer.slice(
            stored.bytes.byteOffset,
            stored.bytes.byteOffset + stored.bytes.byteLength
          );
        }
      };
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

async function withCacheMock(callback) {
  const original = globalThis.caches;
  globalThis.caches = {
    default: {
      async match() { return null; },
      async put() { return true; },
      async delete() { return true; }
    }
  };

  try {
    return await callback();
  } finally {
    if (original === undefined) {
      delete globalThis.caches;
    } else {
      globalThis.caches = original;
    }
  }
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

test('upload rejects oversized authorization headers', async () => {
  const response = await upload({ token: 'x'.repeat(4097) });
  assert.equal(response.status, 401);
});

test('malformed percent-encoding in an upload path returns a client error', async () => {
  const request = new Request('https://media.test/upload/%E0%A4%A', {
    method: 'PUT',
    headers: {
      Authorization: 'Bearer ' + signedToken(),
      'Content-Type': 'image/png'
    },
    body: PNG_SIGNATURE
  });

  const response = await worker.fetch(request, makeEnv(), {});
  assert.equal(response.status, 400);
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

test('upload rejects an object key outside the signed user namespace', async () => {
  const otherUserKey = '43/123e4567-e89b-12d3-a456-426614174000.png';
  const response = await upload({
    key: otherUserKey,
    token: signedToken({
      userId: 42,
      key: otherUserKey
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

test('delete rejects missing, malformed, or non-delete authorization', async () => {
  const noToken = await worker.fetch(
    new Request('https://media.test/delete/' + KEY, { method: 'DELETE' }),
    makeEnv(),
    {}
  );
  assert.equal(noToken.status, 401);

  const uploadToken = signedToken();
  const wrongAction = await worker.fetch(
    new Request('https://media.test/delete/' + KEY, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + uploadToken }
    }),
    makeEnv(),
    {}
  );
  assert.equal(wrongAction.status, 401);
});

test('delete rejects expired and cross-user authorizations', async () => {
  const expired = await worker.fetch(
    new Request('https://media.test/delete/' + KEY, {
      method: 'DELETE',
      headers: {
        Authorization: 'Bearer ' + signedToken({
          action: 'delete',
          expiresAt: Date.now() - 1
        })
      }
    }),
    makeEnv(),
    {}
  );
  assert.equal(expired.status, 401);

  const otherUserKey = '43/123e4567-e89b-12d3-a456-426614174000.png';
  const crossUser = await worker.fetch(
    new Request('https://media.test/delete/' + otherUserKey, {
      method: 'DELETE',
      headers: {
        Authorization: 'Bearer ' + signedToken({
          action: 'delete',
          userId: 42,
          key: otherUserKey
        })
      }
    }),
    makeEnv(),
    {}
  );
  assert.equal(crossUser.status, 401);
});

test('delete removes the R2 object and invalidates every configured variant', async () => {
  await withCacheMock(async () => {
    const bucket = createBucket();
    bucket.objects.set(KEY, {
      bytes: PNG_SIGNATURE,
      options: { customMetadata: { ownerId: '42', purpose: 'post' } }
    });

    const response = await worker.fetch(
      new Request('https://media.test/delete/' + KEY, {
        method: 'DELETE',
        headers: {
          Authorization: 'Bearer ' + signedToken({ action: 'delete' })
        }
      }),
      makeEnv(bucket),
      {}
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
    assert.equal(bucket.objects.has(KEY), false);
  });
});

test('image delivery rejects malformed keys and unsupported variants', async () => {
  const malformed = await worker.fetch(
    new Request('https://media.test/%E0%A4%A'),
    makeEnv(),
    {}
  );
  assert.equal(malformed.status, 404);

  const unsupported = await worker.fetch(
    new Request('https://media.test/' + KEY + '?variant=unknown'),
    makeEnv(),
    {}
  );
  assert.equal(unsupported.status, 400);
});

test('image delivery returns not found for absent objects and mismatched ownership metadata', async () => {
  await withCacheMock(async () => {
    const missing = await worker.fetch(
      new Request('https://media.test/' + KEY),
      makeEnv(),
      {}
    );
    assert.equal(missing.status, 404);

    const bucket = createBucket();
    bucket.objects.set(KEY, {
      bytes: PNG_SIGNATURE,
      options: { customMetadata: { ownerId: '43', purpose: 'post' } }
    });
    const wrongOwner = await worker.fetch(
      new Request('https://media.test/' + KEY),
      makeEnv(bucket),
      {}
    );
    assert.equal(wrongOwner.status, 404);
  });
});

test('image delivery rejects empty or oversized stored objects', async () => {
  await withCacheMock(async () => {
    const bucket = createBucket();
    bucket.objects.set(KEY, {
      bytes: new Uint8Array(0),
      options: { customMetadata: { ownerId: '42', purpose: 'post' } }
    });

    const response = await worker.fetch(
      new Request('https://media.test/' + KEY),
      makeEnv(bucket),
      {}
    );
    assert.equal(response.status, 415);
  });
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


test('post image objects reject direct unauthenticated delivery', async () => {
  await withCacheMock(async () => {
  const bucket = createBucket();
  bucket.objects.set(KEY, {
    bytes: PNG_SIGNATURE,
    options: { customMetadata: { ownerId: '42', purpose: 'post' } }
  });

  const response = await worker.fetch(
    new Request('https://media.test/' + KEY + '?variant=post'),
    makeEnv(bucket),
    {}
  );

  assert.equal(response.status, 401);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  });
});

test('post image read authorization must match action, purpose, owner, and exact object key', async () => {
  await withCacheMock(async () => {
  const bucket = createBucket();
  bucket.objects.set(KEY, {
    bytes: PNG_SIGNATURE,
    options: { customMetadata: { ownerId: '42', purpose: 'post' } }
  });

  const wrongPurpose = await worker.fetch(
    new Request('https://media.test/' + KEY, {
      headers: {
        Authorization: 'Bearer ' + signedToken({
          action: 'read',
          purpose: 'profile'
        })
      }
    }),
    makeEnv(bucket),
    {}
  );
  assert.equal(wrongPurpose.status, 401);

  const wrongKey = await worker.fetch(
    new Request('https://media.test/' + KEY, {
      headers: {
        Authorization: 'Bearer ' + signedToken({
          action: 'read',
          key: '42/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png'
        })
      }
    }),
    makeEnv(bucket),
    {}
  );
  assert.equal(wrongKey.status, 401);

  const expired = await worker.fetch(
    new Request('https://media.test/' + KEY, {
      headers: {
        Authorization: 'Bearer ' + signedToken({
          action: 'read',
          expiresAt: Date.now() - 1
        })
      }
    }),
    makeEnv(bucket),
    {}
  );
  assert.equal(expired.status, 401);
  });
});
