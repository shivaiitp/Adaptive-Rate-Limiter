import { Request, Response, NextFunction } from "express";
import { checkRateLimit } from "../modules/rateLimiter/rateLimiter";
import { getUserTier } from "../config/userService";

export const rateLimiter = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req.headers["x-user-id"] as string) || "anonymous";
    const endpoint = req.path;
    const tier = getUserTier(userId);

    const result = await checkRateLimit(userId, tier, endpoint);

    // Standard rate limit headers (sent on every response)
    res.setHeader("X-RateLimit-Limit", result.limit);
    res.setHeader("X-RateLimit-Remaining", Math.floor(result.tokens));
    res.setHeader("X-RateLimit-Reset", Math.ceil(result.limit / result.limit));

    if (!result.allowed) {
      res.setHeader("Retry-After", result.retryAfter);
      return res.status(429).json({
        message: "Too Many Requests",
        retryAfter: result.retryAfter,
      });
    }

    next();
  } catch (err) {
    console.error("Rate limiter error:", err);
    // fail-open: allow request if rate limiter fails
    next();
  }
};