import Redis from "ioredis";
import { logger } from "../logger";

// ── Connection resolution ────────────────────────────────────────────────────
// Checks every common env var pattern used by hosting providers:
//
//  REDIS_URL          — Railway (linked), Render, Heroku, Fly.io
//  REDIS_PRIVATE_URL  — Railway internal network URL (faster, preferred)
//  REDISHOST + REDISPORT + REDISPASSWORD  — Railway plugin auto-vars
//  REDIS_HOST + REDIS_PORT  — Docker Compose / local dev
//  fallback: 127.0.0.1:6379

// Full-URL providers (checked in priority order)
const redisUrl =
  process.env.REDIS_PRIVATE_URL ||   // Railway internal (fastest)
  process.env.REDIS_URL          ||   // Railway linked / Render / Heroku
  process.env.REDISURL;              // Some providers omit the underscore

// Individual-var providers (Railway plugin auto-injects these to the same service)
const redisHost = process.env.REDISHOST || process.env.REDIS_HOST;
const redisPort = (() => {
  const raw = process.env.REDISPORT || process.env.REDIS_PORT;
  const p = Number(raw);
  return Number.isInteger(p) && p > 0 ? p : 6379;
})();
const redisPassword = process.env.REDISPASSWORD || process.env.REDIS_PASSWORD;

// Safe description for logs (never exposes passwords)
const safeConnectionDesc = (() => {
  if (process.env.REDIS_PRIVATE_URL) return `internal Railway URL (REDIS_PRIVATE_URL)`;
  if (process.env.REDIS_URL)         return `${tryHost(process.env.REDIS_URL)} (REDIS_URL)`;
  if (process.env.REDISURL)          return `${tryHost(process.env.REDISURL)} (REDISURL)`;
  if (redisHost)                     return `${redisHost}:${redisPort} (REDISHOST/REDIS_HOST)`;
  return `127.0.0.1:6379 (fallback — no Redis env vars found)`;
})();

function tryHost(url: string): string {
  try { const u = new URL(url); return `${u.hostname}:${u.port}`; }
  catch { return "(unparseable URL)"; }
}

// Warn loudly if we're falling back to localhost — this will always fail on Railway
if (!redisUrl && !redisHost) {
  logger.warn(
    "No Redis connection env vars found — falling back to 127.0.0.1:6379. " +
    "On Railway, set REDIS_URL = ${{Redis.REDIS_URL}} in your app service Variables tab."
  );
}

logger.debug("Redis connection resolved", { target: safeConnectionDesc });

// ── Client ───────────────────────────────────────────────────────────────────

const sharedOptions = {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 50, 2000);
    logger.warn("Redis connection retry", { attempt: times, nextDelayMs: delay, target: safeConnectionDesc });
    return delay;
  },
};

export const redis = redisUrl
  ? new Redis(redisUrl, sharedOptions)
  : new Redis({
      host: redisHost || "127.0.0.1",
      port: redisPort,
      password: redisPassword,
      ...sharedOptions,
    });

// ── Lifecycle events ─────────────────────────────────────────────────────────

redis.on("connect", () => {
  logger.info("Redis connected", { target: safeConnectionDesc });
});

redis.on("ready", () => {
  logger.debug("Redis client ready", { target: safeConnectionDesc });
});

redis.on("error", (err) => {
  logger.error("Redis client error", err, { target: safeConnectionDesc });
});

redis.on("close", () => {
  logger.warn("Redis connection closed", { target: safeConnectionDesc });
});

redis.on("reconnecting", () => {
  logger.warn("Redis reconnecting...", { target: safeConnectionDesc });
});