import { Router } from "express";
import { redis } from "../../core/redis/client";
import { getAdaptiveFactor } from "../rateLimiter/rateLimiter";
import { HealthStatus } from "../../types";

export const healthRouter = Router();

const startTime = Date.now();

healthRouter.get("/health", async (_, res) => {
  let redisConnected = false;
  try {
    await redis.ping();
    redisConnected = true;
  } catch {}

  const status: HealthStatus = {
    status: redisConnected ? "healthy" : "degraded",
    redis: redisConnected,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    adaptiveFactor: getAdaptiveFactor(),
    timestamp: Date.now(),
  };

  const httpStatus = redisConnected ? 200 : 503;
  res.status(httpStatus).json(status);
});
