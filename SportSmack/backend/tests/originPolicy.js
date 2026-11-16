const assert = require('node:assert/strict');
const { isAllowedOrigin, normalizeOrigin } = require('../lib/originPolicy');
const {
  shouldSkipStandardRateLimit
} = require('../lib/rateLimitPolicy');

const production = {
  NODE_ENV: 'production',
  FRONTEND_URL: 'https://ss-new-backendfromr.vercel.app'
};

const development = {
  NODE_ENV: 'development',
  FRONTEND_URL: 'http://localhost:3000',
  LOAD_TEST_SECRET: 'local-test-secret'
};

assert.equal(isAllowedOrigin('https://ss-new-backendfromr.vercel.app', production), true);
assert.equal(isAllowedOrigin('http://localhost:3000', production), false);
assert.equal(isAllowedOrigin('http://localhost:5173', production), false);
assert.equal(isAllowedOrigin('https://preview.example.com', production), false);
assert.equal(isAllowedOrigin('http://localhost:3000', development), true);
assert.equal(isAllowedOrigin('http://localhost:5173', development), true);
assert.equal(
  isAllowedOrigin(
    'https://ss-new-backendfromr-feature123-sport-smack.vercel.app',
    development
  ),
  true
);
assert.equal(
  isAllowedOrigin(
    'https://ss-new-backendfromr-feature123-sport-smack.vercel.app',
    production
  ),
  false
);
assert.equal(isAllowedOrigin('https://attacker.example', production), false);
assert.equal(isAllowedOrigin(undefined, production), false);
assert.equal(normalizeOrigin('https://example.com///'), 'https://example.com');

// Standard rate limits can never be bypassed in production, even when
// LOAD_TEST_SECRET is configured and the matching header is supplied.
assert.equal(
  shouldSkipStandardRateLimit(
    {
      path: '/posts',
      headers: { 'x-load-test-secret': 'production-secret' }
    },
    { NODE_ENV: 'production', LOAD_TEST_SECRET: 'production-secret' }
  ),
  false
);
assert.equal(
  shouldSkipStandardRateLimit(
    {
      path: '/posts',
      headers: { 'x-load-test-secret': 'wrong-secret' }
    },
    { NODE_ENV: 'production', LOAD_TEST_SECRET: 'production-secret' }
  ),
  false
);

// The dedicated dependency-status endpoint remains exempt.
assert.equal(
  shouldSkipStandardRateLimit(
    { path: '/status', headers: {} },
    { NODE_ENV: 'production', LOAD_TEST_SECRET: 'production-secret' }
  ),
  true
);

// Controlled load tests may bypass the standard limiter only in local
// development/test environments and only with the matching secret.
assert.equal(
  shouldSkipStandardRateLimit(
    {
      path: '/posts',
      headers: { 'x-load-test-secret': 'local-test-secret' }
    },
    development
  ),
  true
);
assert.equal(
  shouldSkipStandardRateLimit(
    {
      path: '/posts',
      headers: { 'x-load-test-secret': 'incorrect' }
    },
    development
  ),
  false
);
assert.equal(
  shouldSkipStandardRateLimit(
    { path: '/posts', headers: {} },
    { NODE_ENV: 'development' }
  ),
  false
);

console.log('ALL ORIGIN AND RATE-LIMIT POLICY TESTS PASSED');
