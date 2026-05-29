import { Request, Response, NextFunction } from "express";
import { logger } from "../core/logger";
import { checkRateLimit } from "../modules/rateLimiter/rateLimiter";
import { resolveRequestUser } from "./identity";
import { recordRequest } from "../modules/monitoring/metricsCollector";

export const rateLimiter = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const start = Date.now();

  try {
    const user = resolveRequestUser(req);
    if (!user) {
      recordRequest(false, Date.now() - start);
      return res.status(401).json({ message: "Invalid or missing API key" });
    }

    const endpoint = req.path;

    const result = await checkRateLimit(user.userId, user.tier, endpoint);
    const latency = Date.now() - start;
    recordRequest(!result.allowed, latency);

    // Standard rate limit headers (sent on every response)
    res.setHeader("X-RateLimit-Limit", result.limit);
    res.setHeader("X-RateLimit-Remaining", Math.floor(result.tokens));
    // Seconds until bucket is fully refilled (token bucket has no fixed window)
    const resetSeconds = result.refillRate > 0
      ? Math.max(0, Math.ceil((result.limit - result.tokens) / result.refillRate))
      : 0;
    res.setHeader("X-RateLimit-Reset", resetSeconds);

    if (!result.allowed) {
      res.setHeader("Retry-After", result.retryAfter);
      return res.status(429).json({
        message: "Too Many Requests",
        retryAfter: result.retryAfter,
      });
    }

    next();
  } catch (err) {
    const latency = Date.now() - start;
    recordRequest(false, latency, false, true); // infra error: don't poison errorRate
    logger.error("Rate limiter error:", err);
    // Fail-open: allow request if rate limiter fails.
    next();
  }
};
