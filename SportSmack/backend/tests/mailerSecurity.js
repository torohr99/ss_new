const assert = require('node:assert/strict');
const test = require('node:test');

process.env.RESEND_API_KEY = 'test-key';

const { sendMail } = require('../lib/mailer');

test('sendMail does not attach provider response data to failures', async t => {
  const originalFetch = global.fetch;

  t.after(() => {
    global.fetch = originalFetch;
  });

  global.fetch = async () => ({
    ok: false,
    status: 422,
    json: async () => ({
      message: 'private recipient details',
      to: ['private@example.com'],
      apiKey: 'must-not-be-logged'
    })
  });

  await assert.rejects(
    sendMail({
      to: 'private@example.com',
      subject: 'Test',
      text: 'Test message'
    }),
    error => {
      assert.equal(error.message, 'Resend email request failed.');
      assert.equal(error.status, 422);
      assert.equal(error.code, 'RESEND_REQUEST_FAILED');
      assert.equal(
        Object.prototype.hasOwnProperty.call(error, 'resendData'),
        false
      );
      return true;
    }
  );
});
