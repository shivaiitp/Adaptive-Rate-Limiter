import http from 'k6/http';
import { check } from 'k6';

export const options = {
  scenarios: {
    free_tier: {
      executor: 'constant-arrival-rate',
      rate: 30,
      timeUnit: '1s',
      duration: '30s',
      preAllocatedVUs: 20,
      exec: 'freeUser',
    },
    pro_tier: {
      executor: 'constant-arrival-rate',
      rate: 200,
      timeUnit: '1s',
      duration: '30s',
      preAllocatedVUs: 50,
      exec: 'proUser',
    },
  },
};

export function freeUser() {
  const res = http.get('http://localhost:3000/test', {
    headers: { 'x-api-key': 'demo-free-key' },
    tags: { tier: 'free' },
  });
  check(res, { 'expected status': (r) => r.status === 200 || r.status === 429 });
}

export function proUser() {
  const res = http.get('http://localhost:3000/test', {
    headers: { 'x-api-key': 'demo-pro-key' },
    tags: { tier: 'pro' },
  });
  check(res, { 'expected status': (r) => r.status === 200 || r.status === 429 });
}
