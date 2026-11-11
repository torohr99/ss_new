const { URL } = require('url');

function validateMediaUrlForUser(value, userId) {
  if (value === null || value === undefined || value === '') {
    return { valid: true, value: null };
  }

  if (typeof value !== 'string' || value.length > 2048) {
    return { valid: false };
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return { valid: false };
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { valid: false };
  }

  const workerUrl = process.env.MEDIA_WORKER_URL;
  if (workerUrl) {
    let workerOrigin;
    try {
      workerOrigin = new URL(workerUrl).origin;
    } catch {
      return { valid: false };
    }

    if (parsed.origin === workerOrigin) {
      const match = /^\/([1-9][0-9]*)\/[0-9a-f-]{36}\.(jpg|png|webp)$/.exec(
        parsed.pathname
      );

      if (
        !match ||
        Number(match[1]) !== Number(userId) ||
        parsed.hash
      ) {
        return { valid: false };
      }

      const variant = parsed.searchParams.get('variant');
      if (variant && !['avatar', 'thumbnail', 'post'].includes(variant)) {
        return { valid: false };
      }

      return { valid: true, value: parsed.toString() };
    }
  }

  // Preserve compatibility with existing third-party image URLs.
  return { valid: true, value: parsed.toString() };
}

module.exports = { validateMediaUrlForUser };
