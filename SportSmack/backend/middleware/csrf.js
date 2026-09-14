const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  process.env.FRONTEND_URL
]
  .filter(Boolean)
  .map(origin =>
    origin.trim().replace(/\/+$/, '')
  );

function isAllowedOrigin(origin) {
  if (!origin) {
    return false;
  }

  const normalizedOrigin =
    origin
      .trim()
      .replace(/\/+$/, '');

  if (
    allowedOrigins.includes(
      normalizedOrigin
    )
  ) {
    return true;
  }

  if (
    process.env.NODE_ENV !== 'production' &&
    /^https:\/\/ss-new-backendfromr(?:-[a-z0-9]+)*-sport-smack\.vercel\.app$/i.test(
      normalizedOrigin
    )
  ) {
    return true;
  }

  return false;
}

function csrfProtection(
  req,
  res,
  next
) {
  const method =
    req.method.toUpperCase();

  // Safe HTTP methods do not change
  // server state.
  if (
    method === 'GET' ||
    method === 'HEAD' ||
    method === 'OPTIONS'
  ) {
    return next();
  }

  const origin =
    req.get('origin');

  /*
   * Every browser state-changing request
   * must identify an allowed origin.
   *
   * This is especially important because
   * authentication uses a cookie.
   */
  if (!origin) {
    return res.status(403).json({
      message:
        'Missing request origin.'
    });
  }

  if (
    !isAllowedOrigin(origin)
  ) {
    return res.status(403).json({
      message:
        'Invalid request origin.'
    });
  }

  return next();
}

module.exports =
  csrfProtection;
