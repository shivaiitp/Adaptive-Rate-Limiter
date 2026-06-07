import { Router } from "express";
import { redis } from "../../core/redis/client";
import { getAdaptiveFactor } from "../rateLimiter/rateLimiter";
import { HealthStatus } from "../../types";
import { logger } from "../../core/logger";

export const healthRouter = Router();

const startTime = Date.now();

healthRouter.get("/health", async (_, res) => {
  let redisConnected = false;
  try {
    await redis.ping();
    redisConnected = true;
  } catch (err) {
    logger.warn("Health check: Redis ping failed", err);
  }

  const status: HealthStatus = {
    status: redisConnected ? "healthy" : "degraded",
    redis: redisConnected,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    adaptiveFactor: getAdaptiveFactor(),
    timestamp: Date.now(),
  };

  logger.debug("Health check requested", {
    status: status.status,
    redis: status.redis,
    uptimeSeconds: status.uptime,
    adaptiveFactor: status.adaptiveFactor,
  });

  const httpStatus = redisConnected ? 200 : 503;
  res.status(httpStatus).json(status);
});
