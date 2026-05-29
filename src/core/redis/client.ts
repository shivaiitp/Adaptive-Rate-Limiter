import Redis from "ioredis";
import { logger } from "../logger";

const redisPort = Number(process.env.REDIS_PORT);

export const redis = new Redis({
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: Number.isInteger(redisPort) && redisPort > 0 ? redisPort : 6379,

  maxRetriesPerRequest: 3,
  lazyConnect: true,

  retryStrategy: (times) => {
    return Math.min(times * 50, 2000);
  },
});

redis.on("connect", () => {
  logger.info("Redis connected");
});

redis.on("error", (err) => {
  logger.error("Redis error:", err);
});
