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
  const method = req.method;
  const path = req.path;

  try {
    const user = resolveRequestUser(req);

    if (!user) {
      const latency = Date.now() - start;
      recordRequest(false, latency);
      logger.warn("Request rejected — invalid or missing API key", {
        method,
        path,
        ip: req.ip,
        latencyMs: latency,
      });
      return res.status(401).json({ message: "Invalid or missing API key" });
    }

    const result = await checkRateLimit(user.userId, user.tier, path);
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
      logger.debug("Request rate-limited", {
        userId: user.userId,
        tier: user.tier,
        method,
        path,
        retryAfter: result.retryAfter,
        limit: result.limit,
        latencyMs: latency,
      });
      return res.status(429).json({
        message: "Too Many Requests",
        retryAfter: result.retryAfter,
      });
    }

    logger.debug("Request allowed", {
      userId: user.userId,
      tier: user.tier,
      method,
      path,
      tokensRemaining: Math.floor(result.tokens),
      latencyMs: latency,
    });

    next();
  } catch (err) {
    const latency = Date.now() - start;
    recordRequest(false, latency, false, true); // infra error: don't poison errorRate
    logger.error("Rate limiter middleware threw unexpectedly — failing open", err, {
      method,
      path,
      ip: req.ip,
      latencyMs: latency,
    });
    // Fail-open: allow request if rate limiter fails.
    next();
  }
};
