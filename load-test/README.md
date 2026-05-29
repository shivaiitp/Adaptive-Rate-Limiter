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

Save raw output:

```bash
k6 run --out json=results.json load-test/steady.js
```
