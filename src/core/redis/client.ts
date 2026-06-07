import Redis from "ioredis";
import { logger } from "../logger";

// ── Connection resolution ────────────────────────────────────────────────────
// Priority:
//  1. REDIS_URL  — full connection string (Railway, Render, Heroku, etc.)
//  2. REDIS_HOST + REDIS_PORT — individual vars (local dev, Docker Compose)
//  3. 127.0.0.1:6379 — last-resort fallback

const redisUrl  = process.env.REDIS_URL;
const redisHost = process.env.REDIS_HOST || "127.0.0.1";
const redisPort = (() => {
  const p = Number(process.env.REDIS_PORT);
  return Number.isInteger(p) && p > 0 ? p : 6379;
})();

// Mask credentials in logs — show host:port only
const safeConnectionDesc = (() => {
  if (redisUrl) {
    try {
      const u = new URL(redisUrl);
      return `${u.hostname}:${u.port} (via REDIS_URL)`;
    } catch {
      return "REDIS_URL (unparseable)";
    }
  }
  return `${redisHost}:${redisPort} (via REDIS_HOST/PORT)`;
})();

logger.debug("Redis connection config resolved", { target: safeConnectionDesc });

// ── Client ───────────────────────────────────────────────────────────────────

export const redis = redisUrl
  ? new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        logger.warn("Redis connection retry", { attempt: times, nextDelayMs: delay, target: safeConnectionDesc });
        return delay;
      },
    })
  : new Redis({
      host: redisHost,
      port: redisPort,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        logger.warn("Redis connection retry", { attempt: times, nextDelayMs: delay, target: safeConnectionDesc });
        return delay;
      },
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