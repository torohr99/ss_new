function shouldSkipStandardRateLimit(req, env = process.env) {
  if (req.path === '/status') {
    return true;
  }

  // A configured load-test secret must never disable production rate limits.
  if (
    env.NODE_ENV !== 'development' &&
    env.NODE_ENV !== 'test'
  ) {
    return false;
  }

  const loadTestSecret = env.LOAD_TEST_SECRET;

  return Boolean(
    loadTestSecret &&
    req.headers?.['x-load-test-secret'] === loadTestSecret
  );
}

module.exports = {
  shouldSkipStandardRateLimit
};
