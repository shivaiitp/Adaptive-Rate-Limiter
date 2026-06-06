# Load Tests

Requires [k6](https://k6.io/docs/get-started/installation/) installed.

```bash
brew install k6   # macOS
```

Make sure the app is running before each test:

```bash
docker compose up
```

Run scenarios:

```bash
k6 run load-test/steady.js
k6 run load-test/tier-mix.js
k6 run load-test/stress-ramp.js
```

Override the target URL when the app is reachable somewhere else:

```bash
k6 run -e BASE_URL=http://localhost:3000 load-test/steady.js
```

Docker runner, useful when k6 is not installed locally:

```bash
docker run --rm --network rate-limiter_default \
  -e BASE_URL=http://app:3000 \
  -v "$PWD/load-test:/scripts" \
  grafana/k6 run /scripts/steady.js
```

Save raw output:

```bash
k6 run --out json=results.json load-test/steady.js
```
