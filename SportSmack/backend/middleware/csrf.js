const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  process.env.FRONTEND_URL
].filter(Boolean);

function isAllowedOrigin(origin) {
  if (!origin) {
    return true;
  }

  if (allowedOrigins.includes(origin)) {
    return true;
  }

  if (
    process.env.NODE_ENV !== 'production' &&
    /^https:\/\/ss-new-backendfromr(?:-[a-z0-9]+)*-sport-smack\.vercel\.app$/i.test(
      origin
    )
  ) {
    return true;
  }

  return false;
}

function csrfProtection(req, res, next) {
  const method = req.method.toUpperCase();

  // Safe HTTP methods do not change server state.
  if (
    method === 'GET' ||
    method === 'HEAD' ||
    method === 'OPTIONS'
  ) {
    return next();
  }

  const origin = req.get('origin');

  if (!isAllowedOrigin(origin)) {
    return res.status(403).json({
      message: 'Invalid request origin.'
    });
  }

  return next();
}

module.exports = csrfProtection;
