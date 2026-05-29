import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 100,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(99)<100'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const res = http.get('http://localhost:3000/test', {
    headers: { 'x-api-key': 'demo-pro-key' },
  });
  check(res, {
    'allowed or rate-limited': (r) => r.status === 200 || r.status === 429,
  });
}
