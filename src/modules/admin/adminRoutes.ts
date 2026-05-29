import { timingSafeEqual } from "crypto";
import { NextFunction, Request, Response, Router } from "express";
import {
  getAllTierConfigs,
  getTierConfig,
  updateTierConfig,
  getAdaptiveConfig,
  updateAdaptiveConfig,
} from "../../config/configService";
import { getAllUsers, setUserTier, removeUser } from "../../config/userService";
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

export const adminRouter = Router();

const adminAuth = (req: Request, res: Response, next: NextFunction) => {
  const adminApiKey = process.env.ADMIN_API_KEY;
  if (!adminApiKey) return next();

  const provided = req.header("x-admin-api-key") ?? "";
  const expectedBuf = Buffer.from(adminApiKey);
  const providedBuf = Buffer.from(provided);

  // Length mismatch fails immediately; equal-length goes through constant-time compare
  const ok = expectedBuf.length === providedBuf.length &&
    timingSafeEqual(expectedBuf, providedBuf);

  if (!ok) {
    return res.status(401).json({ error: "Invalid admin API key" });
  }
  return next();
};

const badRequest = (res: Response, err: unknown) => {
  if (err instanceof ValidationError) {
    return res.status(400).json({ error: err.message });
  }

  throw err;
};

adminRouter.use(adminAuth);

// Tier config

adminRouter.get("/config/tiers", (_, res) => {
  res.json(getAllTierConfigs());
});

adminRouter.get("/config/tiers/:tier", (req, res) => {
  const tier = req.params.tier;
  if (!isUserTier(tier)) {
    return res.status(400).json({ error: "Invalid tier" });
  }

  const config = getTierConfig(tier);
  if (!config) return res.status(404).json({ error: "Tier not found" });
  return res.json(config);
});

adminRouter.put("/config/tiers/:tier", (req, res) => {
  const tier = req.params.tier;
  if (!isUserTier(tier)) {
    return res.status(400).json({ error: "Invalid tier" });
  }

  try {
    const update = parseTierConfigUpdate(req.body, tier);
    return res.json(updateTierConfig(update));
  } catch (err) {
    return badRequest(res, err);
  }
});

// Adaptive config

adminRouter.get("/config/adaptive", (_, res) => {
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
    return res.json(updated);
  } catch (err) {
    return badRequest(res, err);
  }
});

// Users

adminRouter.get("/users", (_, res) => {
  res.json(getAllUsers());
});

adminRouter.put("/users/:userId", (req, res) => {
  const { userId } = req.params;
  const { tier } = req.body;

  if (!isValidUserId(userId)) {
    return res.status(400).json({ error: "Invalid userId" });
  }

  if (!isUserTier(tier)) {
    return res.status(400).json({ error: "Invalid or missing tier" });
  }

  setUserTier(userId, tier);
  return res.json({ userId, tier });
});

adminRouter.delete("/users/:userId", (req, res) => {
  const { userId } = req.params;

  if (!isValidUserId(userId)) {
    return res.status(400).json({ error: "Invalid userId" });
  }

  const removed = removeUser(userId);
  if (!removed) return res.status(404).json({ error: "User not found" });
  return res.json({ message: `User ${userId} removed` });
});

// Metrics

adminRouter.get("/metrics", (_, res) => {
  res.json({
    ...getMetrics(),
    adaptiveFactor: getAdaptiveFactor(),
  });
});
