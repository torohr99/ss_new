const crypto = require('node:crypto');

function emailActionRateLimitKey(req) {
  const email =
    typeof req.body?.email === 'string'
      ? req.body.email.trim().toLowerCase()
      : '';

  // Hash the normalized address so Redis keys never contain raw email addresses.
  const identity = email || 'missing-email';
  const digest = crypto
    .createHash('sha256')
    .update(identity, 'utf8')
    .digest('hex');

  return 'email:' + digest;
}

module.exports = { emailActionRateLimitKey };
