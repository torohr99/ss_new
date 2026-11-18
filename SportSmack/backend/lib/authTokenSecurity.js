const crypto = require('node:crypto');

const AUTH_TOKEN_BYTES = 32;
const AUTH_TOKEN_PATTERN = /^[a-f0-9]{64}$/;
const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

function generateAuthToken() {
  return crypto.randomBytes(AUTH_TOKEN_BYTES).toString('hex');
}

function isValidAuthToken(token) {
  return typeof token === 'string' && AUTH_TOKEN_PATTERN.test(token);
}

function hashAuthToken(token) {
  if (!isValidAuthToken(token)) {
    return null;
  }

  return crypto
    .createHash('sha256')
    .update(token, 'utf8')
    .digest('hex');
}

function getVerificationTokenExpiry(now = Date.now()) {
  return new Date(now + VERIFICATION_TOKEN_TTL_MS);
}

function getResetTokenExpiry(now = Date.now()) {
  return new Date(now + RESET_TOKEN_TTL_MS);
}

module.exports = {
  AUTH_TOKEN_BYTES,
  VERIFICATION_TOKEN_TTL_MS,
  RESET_TOKEN_TTL_MS,
  generateAuthToken,
  isValidAuthToken,
  hashAuthToken,
  getVerificationTokenExpiry,
  getResetTokenExpiry
};
