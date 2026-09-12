import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 5,
  duration: '30s',

  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000']
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
  const suffix = String(__VU).padStart(2, '0');

  const email =
    `${TEST_EMAIL_PREFIX}${suffix}@sportsmack.local`;

  const login = http.post(
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

  check(login, {
    'login returns 200': (r) =>
      r.status === 200,

    'login returns auth cookie': (r) =>
      r.cookies.smack_auth &&
      r.cookies.smack_auth.length > 0
  });

  if (login.status !== 200) {
    throw new Error(
      `Login failed for ${email} with status ${login.status}: ${login.body}`
    );
  }

  const cookie =
    login.cookies.smack_auth?.[0]?.value;

  if (!cookie) {
    throw new Error(
      `No authentication cookie returned for ${email}.`
    );
  }

  const response = http.get(
    `${BASE_URL}/api/posts`,
    {
      headers: {
        Cookie: `smack_auth=${cookie}`
      }
    }
  );

  check(response, {
    'feed returns 200': (r) =>
      r.status === 200,

    'feed contains posts array': (r) => {
      try {
        return Array.isArray(
          r.json('posts')
        );
      } catch {
        return false;
      }
    }
  });

  sleep(1);
}
