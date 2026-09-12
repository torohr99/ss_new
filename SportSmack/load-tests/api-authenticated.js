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
const TEST_EMAIL = __ENV.TEST_EMAIL;
const TEST_PASSWORD = __ENV.TEST_PASSWORD;

export function setup() {
  if (!BASE_URL || !TEST_EMAIL || !TEST_PASSWORD) {
    throw new Error(
      'BASE_URL, TEST_EMAIL, and TEST_PASSWORD are required.'
    );
  }

  const login = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({
      email: TEST_EMAIL,
      password: TEST_PASSWORD
    }),
    {
      headers: {
        'Content-Type': 'application/json'
      }
    }
  );

  check(login, {
    'login returns 200': (r) => r.status === 200,
    'login returns auth cookie': (r) =>
      r.cookies.smack_auth &&
      r.cookies.smack_auth.length > 0
  });

  if (login.status !== 200) {
    throw new Error(
      `Login failed with status ${login.status}: ${login.body}`
    );
  }

  const cookie = login.cookies.smack_auth?.[0]?.value;

  if (!cookie) {
    throw new Error('Authentication cookie was not returned.');
  }

  return { cookie };
}

export default function (data) {
  const response = http.get(
    `${BASE_URL}/api/posts`,
    {
      headers: {
        Cookie: `smack_auth=${data.cookie}`
      }
    }
  );

  check(response, {
    'feed returns 200': (r) => r.status === 200,
    'feed contains posts array': (r) => {
      try {
        return Array.isArray(r.json('posts'));
      } catch {
        return false;
      }
    }
  });

  sleep(1);
}
