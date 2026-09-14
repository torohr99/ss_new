import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 25,
  duration: '60s',

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

  for (let i = 1; i <= 25; i++) {
    const suffix = String(i).padStart(2, '0');

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
          'Content-Type': 'application/json',
          'Origin': BASE_URL
        }
      }
    );

    check(login, {
      'setup login returns 200': (r) =>
        r.status === 200,

      'setup login returns auth cookie': (r) =>
        r.cookies.smack_auth &&
        r.cookies.smack_auth.length > 0
    });

    if (login.status !== 200) {
      throw new Error(
        `Setup login failed for ${email}: ` +
        `${login.status} ${login.body}`
      );
    }

    const authCookies =
      login.cookies.smack_auth;

    if (
      !authCookies ||
      authCookies.length === 0 ||
      !authCookies[0].value
    ) {
      throw new Error(
        `No smack_auth cookie returned for ${email}`
      );
    }

    users.push({
      email,
      authCookie: authCookies[0].value
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

  const headers = {
    Cookie:
      `smack_auth=${user.authCookie}`,
    Origin: BASE_URL
  };

  // ----------------------------------------------------------
  // NORMAL FEED
  // ----------------------------------------------------------

  const feedResponse =
    http.get(
      `${BASE_URL}/api/posts`,
      {
        headers
      }
    );

  check(feedResponse, {
    'normal feed returns 200': (r) =>
      r.status === 200,

    'normal feed contains posts array': (r) => {
      try {
        return Array.isArray(
          r.json('posts')
        );
      } catch {
        return false;
      }
    }
  });

  // ----------------------------------------------------------
  // SOCIAL FEED
  // ----------------------------------------------------------

  const socialResponse =
    http.get(
      `${BASE_URL}/api/posts/social`,
      {
        headers
      }
    );

  check(socialResponse, {
    'social feed returns 200': (r) =>
      r.status === 200,

    'social feed contains posts array': (r) => {
      try {
        return Array.isArray(
          r.json('posts')
        );
      } catch {
        return false;
      }
    },

    'social feed contains nextCursor field': (r) => {
      try {
        const body = r.json();

        return (
          Object.prototype.hasOwnProperty.call(
            body,
            'nextCursor'
          )
        );
      } catch {
        return false;
      }
    }
  });

  sleep(4);
}
