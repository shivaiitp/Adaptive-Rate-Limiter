import http from 'k6/http';
import { check } from 'k6';

http.setResponseCallback(http.expectedStatuses({ min: 200, max: 399 }, 429));

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export const options = {
  vus: 100,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<250', 'p(99)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/test`, {
    headers: { 'x-api-key': 'demo-pro-key' },
  });
  check(res, {
    'allowed or rate-limited': (r) => r.status === 200 || r.status === 429,
  });
}
