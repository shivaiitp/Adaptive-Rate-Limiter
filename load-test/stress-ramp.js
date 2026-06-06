import http from 'k6/http';
import { check } from 'k6';

http.setResponseCallback(http.expectedStatuses({ min: 200, max: 399 }, 429));

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export const options = {
  stages: [
    { duration: '30s', target: 100 },
    { duration: '30s', target: 500 },
    { duration: '30s', target: 1000 },
    { duration: '30s', target: 0 },
  ],
};

export default function () {
  const res = http.get(`${BASE_URL}/test`, {
    headers: { 'x-api-key': 'demo-enterprise-key' },
  });
  check(res, { 'no 5xx': (r) => r.status < 500 });
}
