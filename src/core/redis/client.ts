import Redis from "ioredis";
import { logger } from "../logger";

const redisPort = Number(process.env.REDIS_PORT);

export const redis = new Redis({
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: Number.isInteger(redisPort) && redisPort > 0 ? redisPort : 6379,

  maxRetriesPerRequest: 3,
  lazyConnect: true,

  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    logger.warn("Redis connection retry", { attempt: times, nextDelayMs: delay });
    return delay;
  },
});

redis.on("connect", () => {
  logger.info("Redis connected", {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number.isInteger(redisPort) && redisPort > 0 ? redisPort : 6379,
  });
});

redis.on("ready", () => {
  logger.debug("Redis client ready");
});

redis.on("error", (err) => {
  logger.error("Redis client error", err);
});

redis.on("close", () => {
  logger.warn("Redis connection closed");
});

redis.on("reconnecting", () => {
  logger.warn("Redis reconnecting...");
});