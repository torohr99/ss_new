const assert = require('node:assert/strict');
const { isAllowedOrigin, normalizeOrigin } = require('../lib/originPolicy');

const production = {
  NODE_ENV: 'production',
  FRONTEND_URL: 'https://ss-new-backendfromr.vercel.app'
};

const development = {
  NODE_ENV: 'development',
  FRONTEND_URL: 'http://localhost:3000'
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

console.log('ALL ORIGIN POLICY TESTS PASSED');
