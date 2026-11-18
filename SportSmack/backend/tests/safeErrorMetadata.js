const assert = require('node:assert/strict');
const test = require('node:test');

const safeErrorMetadata =
  require('../lib/safeErrorMetadata');

test('safeErrorMetadata keeps only allowlisted error metadata', () => {
  const error = new Error('password=do-not-log');
  error.code = 'P2002';
  error.type = 'entity.parse.failed';
  error.body = 'raw request body';
  error.headers = {
    authorization: 'Bearer do-not-log',
    cookie: 'smack_auth=do-not-log'
  };
  error.resendData = {
    to: 'private@example.com',
    apiKey: 'do-not-log'
  };

  assert.deepEqual(
    safeErrorMetadata(error),
    {
      name: 'Error',
      code: 'P2002',
      type: 'entity.parse.failed'
    }
  );
});

test('safeErrorMetadata handles unknown and non-Error values', () => {
  assert.deepEqual(
    safeErrorMetadata('sensitive string'),
    { name: 'Error' }
  );

  assert.deepEqual(
    safeErrorMetadata({
      name: 'x'.repeat(101),
      code: 42,
      type: null
    }),
    { name: 'Error' }
  );
});
