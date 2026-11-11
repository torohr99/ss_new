import {
  PhotonImage,
  SamplingFilter,
  resize
} from '@cf-wasm/photon/workerd';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp'
]);

const VARIANTS = {
  avatar: 256,
  thumbnail: 640,
  post: 1200
};

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);

  const headers = {
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400'
  };

  if (origin && allowed.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
}

function json(data, status, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers
    }
  });
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

async function verifyUploadToken(token, secret) {
  if (!token || !secret) return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      decodeBase64Url(parts[1]),
      new TextEncoder().encode(parts[0])
    );

    if (!valid) return null;

    const payload = JSON.parse(
      new TextDecoder().decode(decodeBase64Url(parts[0]))
    );

    if (
      !payload ||
      !Number.isInteger(payload.userId) ||
      !Number.isFinite(payload.expiresAt) ||
      payload.expiresAt < Date.now() ||
      !['profile', 'post'].includes(payload.purpose) ||
      !ALLOWED_TYPES.has(payload.contentType)
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function matchesImageSignature(bytes, contentType) {
  if (contentType === 'image/jpeg') {
    return bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff;
  }

  if (contentType === 'image/png') {
    return bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a;
  }

  if (contentType === 'image/webp') {
    return bytes.length >= 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
      String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  }

  return false;
}

function validObjectKey(key, userId) {
  const match = /^([1-9][0-9]*)\/([0-9a-f-]{36})\.(jpg|png|webp)$/.exec(key);
  return Boolean(match && Number(match[1]) === userId);
}

async function handleUpload(request, env, url) {
  const cors = corsHeaders(request, env);
  const key = decodeURIComponent(url.pathname.slice('/upload/'.length));
  const token = (request.headers.get('Authorization') || '')
    .replace(/^Bearer\s+/i, '');

  const payload = await verifyUploadToken(token, env.MEDIA_UPLOAD_SECRET);

  if (!payload || !validObjectKey(key, payload.userId)) {
    return json({ message: 'Invalid or expired upload authorization.' }, 401, cors);
  }

  if (request.headers.get('Content-Type') !== payload.contentType) {
    return json({ message: 'Content-Type does not match upload authorization.' }, 415, cors);
  }

  const declaredLength = Number(request.headers.get('Content-Length') || 0);
  if (declaredLength > MAX_UPLOAD_BYTES) {
    return json({ message: 'Images must be 5 MB or smaller.' }, 413, cors);
  }

  if (await env.MEDIA_BUCKET.head(key)) {
    return json({ message: 'This upload authorization has already been used.' }, 409, cors);
  }

  const bytes = new Uint8Array(await request.arrayBuffer());

  if (!bytes.length || bytes.length > MAX_UPLOAD_BYTES) {
    return json({ message: 'Images must be between 1 byte and 5 MB.' }, 413, cors);
  }

  if (!matchesImageSignature(bytes, payload.contentType)) {
    return json({ message: 'The uploaded file does not match an allowed image format.' }, 415, cors);
  }

  await env.MEDIA_BUCKET.put(key, bytes, {
    httpMetadata: {
      contentType: payload.contentType,
      cacheControl: 'public, max-age=31536000, immutable'
    },
    customMetadata: {
      ownerId: String(payload.userId),
      purpose: payload.purpose
    }
  });

  return json({
    success: true,
    imageUrl: url.origin + '/' + key,
    key
  }, 201, cors);
}

async function handleImage(request, env, url, ctx) {
  const key = decodeURIComponent(url.pathname.slice(1));

  if (!/^([1-9][0-9]*)\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(key)) {
    return new Response('Not found', { status: 404 });
  }

  const object = await env.MEDIA_BUCKET.get(key);
  if (!object) return new Response('Not found', { status: 404 });

  const variant = url.searchParams.get('variant') || 'post';
  const maxDimension = VARIANTS[variant];

  if (!maxDimension) {
    return new Response('Unsupported image variant', { status: 400 });
  }

  const etag = object.httpEtag || object.etag || key;
  const cacheKey = new Request(
    url.origin + '/' + key + '?variant=' + variant,
    { method: 'GET' }
  );

  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const inputBytes = new Uint8Array(await object.arrayBuffer());
  if (!inputBytes.length || inputBytes.length > MAX_UPLOAD_BYTES) {
    return new Response('Invalid stored image', { status: 415 });
  }

  let inputImage;
  let outputImage;

  try {
    inputImage = PhotonImage.new_from_byteslice(inputBytes);

    const originalWidth = inputImage.get_width();
    const originalHeight = inputImage.get_height();

    if (!originalWidth || !originalHeight) {
      return new Response('Invalid image dimensions', { status: 415 });
    }

    const scale = Math.min(
      1,
      maxDimension / originalWidth,
      maxDimension / originalHeight
    );

    const targetWidth = Math.max(1, Math.round(originalWidth * scale));
    const targetHeight = Math.max(1, Math.round(originalHeight * scale));

    outputImage = resize(
      inputImage,
      targetWidth,
      targetHeight,
      SamplingFilter.Lanczos3
    );

    const outputBytes = outputImage.get_bytes_webp();
    const response = new Response(outputBytes, {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'ETag': '"' + etag + '-' + variant + '-webp"',
        'X-Content-Type-Options': 'nosniff',
        'Access-Control-Allow-Origin': '*'
      }
    });

    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (error) {
    console.error('Image transformation failed:', error);
    return new Response('Unable to process image', { status: 415 });
  } finally {
    if (outputImage) outputImage.free();
    if (inputImage) inputImage.free();
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname === '/health' && request.method === 'GET') {
      return json({ status: 'ok', service: 'sportsmack-media' }, 200, cors);
    }

    if (url.pathname.startsWith('/upload/') && request.method === 'PUT') {
      return handleUpload(request, env, url);
    }

    if (request.method === 'GET') {
      return handleImage(request, env, url, ctx);
    }

    return new Response('Method not allowed', {
      status: 405,
      headers: { Allow: 'GET, PUT, OPTIONS', ...cors }
    });
  }
};
