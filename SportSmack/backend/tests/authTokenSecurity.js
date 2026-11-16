const test = require('node:test');
const assert = require('node:assert/strict');
const {
  AUTH_TOKEN_BYTES,
  VERIFICATION_TOKEN_TTL_MS,
  RESET_TOKEN_TTL_MS,
  generateAuthToken,
  isValidAuthToken,
  hashAuthToken,
  getVerificationTokenExpiry,
  getResetTokenExpiry
} = require('../lib/authTokenSecurity');

test('generated auth tokens contain 32 random bytes encoded as 64 lowercase hex characters', () => {
  const token = generateAuthToken();

  assert.equal(AUTH_TOKEN_BYTES, 32);
  assert.equal(token.length, 64);
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.equal(isValidAuthToken(token), true);
});

test('generated auth tokens are not repeated across independent generations', () => {
  assert.notEqual(generateAuthToken(), generateAuthToken());
});

test('token hashing is deterministic SHA-256 and never returns the raw token', () => {
  const token = 'a'.repeat(64);
  const digest = hashAuthToken(token);

  assert.equal(digest.length, 64);
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.notEqual(digest, token);
  assert.equal(hashAuthToken(token), digest);
});

test('malformed tokens are rejected and never hashed', () => {
  for (const token of [
    null,
    undefined,
    '',
    'a'.repeat(63),
    'a'.repeat(65),
    'g'.repeat(64),
    'A'.repeat(64),
    123
  ]) {
    assert.equal(isValidAuthToken(token), false);
    assert.equal(hashAuthToken(token), null);
  }
});

test('verification tokens expire after 24 hours', () => {
  const now = 1_800_000_000_000;
  assert.equal(VERIFICATION_TOKEN_TTL_MS, 24 * 60 * 60 * 1000);
  assert.equal(
    getVerificationTokenExpiry(now).getTime(),
    now + VERIFICATION_TOKEN_TTL_MS
  );
});

test('password reset tokens expire after one hour', () => {
  const now = 1_800_000_000_000;
  assert.equal(RESET_TOKEN_TTL_MS, 60 * 60 * 1000);
  assert.equal(
    getResetTokenExpiry(now).getTime(),
    now + RESET_TOKEN_TTL_MS
  );
});
