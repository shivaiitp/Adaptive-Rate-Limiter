import http from 'k6/http';
import { check } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 100 },
    { duration: '30s', target: 500 },
    { duration: '30s', target: 1000 },
    { duration: '30s', target: 0 },
  ],
};

export default function () {
  const res = http.get('http://localhost:3000/test', {
    headers: { 'x-api-key': 'demo-enterprise-key' },
  });
  check(res, { 'no 5xx': (r) => r.status < 500 });
}
