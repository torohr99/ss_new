import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 10,
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000']
  }
};

const BASE_URL = __ENV.BASE_URL;

export default function () {
  const response = http.get(`${BASE_URL}/health`);

  check(response, {
    'health returns 200': (r) => r.status === 200
  });

  sleep(1);
}
