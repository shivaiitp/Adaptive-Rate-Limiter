import { Request, Response, NextFunction } from "express";
import { checkRateLimit } from "../modules/rateLimiter/rateLimiter";
import { getUserTier } from "../config/userService";
import { recordRequest } from "../modules/monitoring/metricsCollector";

export const rateLimiter = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const start = Date.now();

  try {
    const userId = (req.headers["x-user-id"] as string) || "anonymous";
    const endpoint = req.path;
    const tier = getUserTier(userId);

    const result = await checkRateLimit(userId, tier, endpoint);
    const latency = Date.now() - start;
    recordRequest(!result.allowed, latency);

    // Standard rate limit headers (sent on every response)
    res.setHeader("X-RateLimit-Limit", result.limit);
    res.setHeader("X-RateLimit-Remaining", Math.floor(result.tokens));
    // Seconds until bucket is fully refilled (token bucket has no fixed window)
    const resetSeconds = Math.ceil((result.limit - result.tokens) / result.refillRate);
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
    recordRequest(false, latency, true);  // true = server error (Redis down, etc.)
    console.error("Rate limiter error:", err);
    // fail-open: allow request if rate limiter fails
    next();
  }
};