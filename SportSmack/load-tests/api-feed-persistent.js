import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 25,
  duration: '30s',

  // Keep each VU's cookies between iterations.
  noCookiesReset: true,

  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<2000']
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

export function setup() {
  const users = [];

  for (let i = 1; i <= 50; i++) {
    const suffix = String(i).padStart(2, '0');

    users.push({
      email:
        `${TEST_EMAIL_PREFIX}${suffix}@sportsmack.local`
    });
  }

  return { users };
}

export default function (data) {
  const user =
    data.users[__VU - 1];

  if (!user) {
    throw new Error(
      `No test user configured for VU ${__VU}.`
    );
  }

  // Each VU logs in only once.
  if (__ITER === 0) {
    const login = http.post(
      `${BASE_URL}/api/auth/login`,
      JSON.stringify({
        email: user.email,
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
        `Login failed for ${user.email}: ${login.status} ${login.body}`
      );
    }
  }

  sleep(1);

  const response =
    http.get(`${BASE_URL}/api/posts`);

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
