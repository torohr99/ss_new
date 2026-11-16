const { isAllowedOrigin } = require('../lib/originPolicy');

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
