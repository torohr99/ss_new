import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 10,
  iterations: 10,

  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<5000']
  }
};

const BASE_URL = __ENV.BASE_URL;
const TEST_PASSWORD = __ENV.TEST_PASSWORD;
const TEST_EMAIL_PREFIX =
  __ENV.TEST_EMAIL_PREFIX || 'loadtest';

if (!BASE_URL || !TEST_PASSWORD) {
  throw new Error(
    'BASE_URL and TEST_PASSWORD are required.'
  );
}

export default function () {
  const suffix =
    String(__VU).padStart(2, '0');

  const email =
    `${TEST_EMAIL_PREFIX}${suffix}@sportsmack.local`;

  const response = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({
      email,
      password: TEST_PASSWORD
    }),
    {
      headers: {
        'Content-Type': 'application/json'
      }
    }
  );

  check(response, {
    'login returns 200': (r) =>
      r.status === 200,

    'login returns auth cookie': (r) =>
      r.cookies.smack_auth &&
      r.cookies.smack_auth.length > 0
  });
}
