import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    social_feed: {
      executor: 'constant-vus',
      vus: 10,
      duration: '2m'
    }
  },

  thresholds: {
    http_req_failed: [
      'rate<0.01'
    ],

    http_req_duration: [
      'p(95)<1000'
    ]
  }
};

const BASE_URL =
  __ENV.API_URL ||
  'https://YOUR-RAILWAY-DOMAIN';

export default function () {
  const response = http.get(
    `${BASE_URL}/api/posts/social`,
    {
      headers: {
        Origin:
          __ENV.FRONTEND_URL ||
          'https://YOUR-VERCEL-DOMAIN'
      }
    }
  );

  check(response, {
    'status is 200': r =>
      r.status === 200,

    'response is JSON': r =>
      r.headers['Content-Type']?.includes(
        'application/json'
      )
  });

  sleep(1);
}
