const LOCAL_DEVELOPMENT_ORIGINS = new Set([
  'http://localhost:3000',
  'http://localhost:5173'
]);

const VERCEL_PREVIEW_ORIGIN =
  /^https:\/\/ss-new-backendfromr(?:-[a-z0-9]+)*-sport-smack\.vercel\.app$/i;

function normalizeOrigin(origin) {
  return origin.trim().replace(/\/+$/, '');
}

function isAllowedOrigin(origin, env = process.env) {
  if (typeof origin !== 'string' || !origin.trim()) {
    return false;
  }

  const normalizedOrigin = normalizeOrigin(origin);
  const configuredFrontendOrigin = typeof env.FRONTEND_URL === 'string'
    ? normalizeOrigin(env.FRONTEND_URL)
    : '';

  if (
    configuredFrontendOrigin &&
    normalizedOrigin === configuredFrontendOrigin
  ) {
    return true;
  }

  if (env.NODE_ENV === 'production') {
    return false;
  }

  return (
    LOCAL_DEVELOPMENT_ORIGINS.has(normalizedOrigin) ||
    VERCEL_PREVIEW_ORIGIN.test(normalizedOrigin)
  );
}

module.exports = {
  isAllowedOrigin,
  normalizeOrigin
};
