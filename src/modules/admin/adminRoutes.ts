import { timingSafeEqual } from "crypto";
import { NextFunction, Request, Response, Router } from "express";
import {
  getAllTierConfigs,
  getTierConfig,
  updateTierConfig,
  getAdaptiveConfig,
  updateAdaptiveConfig,
} from "../../config/configService";
import { getAllUsers, setUserTier, removeUser, setUserApiKey } from "../../config/userService";
import {
  isUserTier,
  isValidUserId,
  parseAdaptiveConfigUpdate,
  parseTierConfigUpdate,
  ValidationError,
} from "../../config/validation";
import { getMetrics } from "../monitoring/metricsCollector";
import { getAdaptiveFactor } from "../rateLimiter/rateLimiter";
import { restartAdaptiveThrottling } from "../adaptive/adaptiveThrottler";
import { logger } from "../../core/logger";

export const adminRouter = Router();

const adminAuth = (req: Request, res: Response, next: NextFunction) => {
  const adminApiKey = process.env.ADMIN_API_KEY;
  if (!adminApiKey) {
    logger.warn("ADMIN_API_KEY not set — admin API is unprotected");
    return next();
  }

  const provided = req.header("x-admin-api-key") ?? "";
  const expectedBuf = Buffer.from(adminApiKey);
  const providedBuf = Buffer.from(provided);

  // Length mismatch fails immediately; equal-length goes through constant-time compare
  const ok = expectedBuf.length === providedBuf.length &&
    timingSafeEqual(expectedBuf, providedBuf);

  if (!ok) {
    logger.warn("Admin auth failed — invalid API key", {
      method: req.method,
      path: req.path,
      ip: req.ip,
    });
    return res.status(401).json({ error: "Invalid admin API key" });
  }

  logger.debug("Admin auth passed", { method: req.method, path: req.path });
  return next();
};

const badRequest = (res: Response, err: unknown) => {
  if (err instanceof ValidationError) {
    logger.warn("Admin request validation failed", { error: err.message });
    return res.status(400).json({ error: err.message });
  }
  throw err;
};

adminRouter.use(adminAuth);

// ── Tier config ─────────────────────────────────────────────────────────────

adminRouter.get("/config/tiers", (_, res) => {
  logger.debug("Admin: GET /config/tiers");
  res.json(getAllTierConfigs());
});

adminRouter.get("/config/tiers/:tier", (req, res) => {
  const tier = req.params.tier;
  if (!isUserTier(tier)) {
    logger.warn("Admin: invalid tier in GET request", { tier });
    return res.status(400).json({ error: "Invalid tier" });
  }

  const config = getTierConfig(tier);
  if (!config) {
    logger.warn("Admin: tier config not found", { tier });
    return res.status(404).json({ error: "Tier not found" });
  }

  logger.debug("Admin: GET /config/tiers/:tier", { tier });
  return res.json(config);
});

adminRouter.put("/config/tiers/:tier", (req, res) => {
  const tier = req.params.tier;
  if (!isUserTier(tier)) {
    logger.warn("Admin: invalid tier in PUT request", { tier });
    return res.status(400).json({ error: "Invalid tier" });
  }

  try {
    const update = parseTierConfigUpdate(req.body, tier);
    const result = updateTierConfig(update);
    logger.info("Admin: tier config updated", { tier, update: req.body });
    return res.json(result);
  } catch (err) {
    return badRequest(res, err);
  }
});

// ── Adaptive config ──────────────────────────────────────────────────────────

adminRouter.get("/config/adaptive", (_, res) => {
  logger.debug("Admin: GET /config/adaptive");
  res.json({
    ...getAdaptiveConfig(),
    currentFactor: getAdaptiveFactor(),
  });
});

adminRouter.put("/config/adaptive", (req, res) => {
  try {
    const update = parseAdaptiveConfigUpdate(req.body, getAdaptiveConfig());
    const updated = updateAdaptiveConfig(update);
    restartAdaptiveThrottling();
    logger.info("Admin: adaptive config updated", { update: req.body });
    return res.json(updated);
  } catch (err) {
    return badRequest(res, err);
  }
});

// ── Users ────────────────────────────────────────────────────────────────────

adminRouter.get("/users", (_, res) => {
  logger.debug("Admin: GET /users");
  res.json(getAllUsers());
});

adminRouter.put("/users/:userId", (req, res) => {
  const { userId } = req.params;
  const { tier } = req.body;

  if (!isValidUserId(userId)) {
    logger.warn("Admin: invalid userId in PUT /users", { userId });
    return res.status(400).json({ error: "Invalid userId" });
  }

  if (!isUserTier(tier)) {
    logger.warn("Admin: invalid tier in PUT /users", { userId, tier });
    return res.status(400).json({ error: "Invalid or missing tier" });
  }

  // Generate a deterministic API key for the user and register it
  const apiKey = `${userId}-${tier}-key`;
  setUserTier(userId, tier);
  setUserApiKey(apiKey, userId);
  logger.info("Admin: user created/updated with API key", { userId, tier, apiKey });
  return res.json({ userId, tier, apiKey });
});

adminRouter.delete("/users/:userId", (req, res) => {
  const { userId } = req.params;

  if (!isValidUserId(userId)) {
    logger.warn("Admin: invalid userId in DELETE /users", { userId });
    return res.status(400).json({ error: "Invalid userId" });
  }

  const removed = removeUser(userId);
  if (!removed) {
    logger.warn("Admin: user not found for deletion", { userId });
    return res.status(404).json({ error: "User not found" });
  }

  logger.info("Admin: user removed", { userId });
  return res.json({ message: `User ${userId} removed` });
});

// ── Metrics ──────────────────────────────────────────────────────────────────

adminRouter.get("/metrics", (_, res) => {
  logger.debug("Admin: GET /metrics");
  res.json({
    ...getMetrics(),
    adaptiveFactor: getAdaptiveFactor(),
  });
});
