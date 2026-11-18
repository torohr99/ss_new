const test = require('node:test');
const assert = require('node:assert/strict');
const { emailActionRateLimitKey } = require('../lib/emailActionRateLimit');

test('email action rate-limit keys normalize email addresses', () => {
  assert.equal(
    emailActionRateLimitKey({ body: { email: ' User@Example.com ' } }),
    emailActionRateLimitKey({ body: { email: 'user@example.com' } })
  );
});

test('email action rate-limit keys do not contain raw email addresses', () => {
  const key = emailActionRateLimitKey({
    body: { email: 'private@example.com' }
  });

  assert.ok(!key.includes('private@example.com'));
  assert.match(key, /^email:[a-f0-9]{64}$/);
});

test('different email addresses receive different rate-limit keys', () => {
  assert.notEqual(
    emailActionRateLimitKey({ body: { email: 'one@example.com' } }),
    emailActionRateLimitKey({ body: { email: 'two@example.com' } })
  );
});
