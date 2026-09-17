import http from 'k6/http';
import { check, sleep } from 'k6';

const VUS = Number(__ENV.VUS || 5000);
const DURATION = __ENV.DURATION || '60s';

export const options = {
  vus: VUS,
  duration: DURATION,

  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<2000']
  }
};

const BASE_URL = __ENV.BASE_URL;
const FRONTEND_URL = __ENV.FRONTEND_URL;
const LOAD_TEST_SECRET = __ENV.LOAD_TEST_SECRET;

if (!BASE_URL || !FRONTEND_URL || !LOAD_TEST_SECRET) {
  throw new Error(
    'BASE_URL, FRONTEND_URL, and LOAD_TEST_SECRET are required.'
  );
}

export default function () {
  const response = http.get(
    `${BASE_URL}/api/status`,
    {
      headers: {
        Origin: FRONTEND_URL,
        'X-Load-Test-Secret': LOAD_TEST_SECRET
      }
    }
  );

  check(response, {
    'status endpoint returns 200': (r) => r.status === 200,
    'status endpoint returns OK': (r) => {
      try {
        return r.json('status') === 'OK';
      } catch {
        return false;
      }
    }
  });

  if (response.status !== 200) {
    console.log(
      `STATUS FAILURE: ${response.status} ` +
      `replica=${response.headers['X-Replica-ID'] || 'NONE'} ` +
      `${response.body}`
    );
  }

  sleep(4);
}
