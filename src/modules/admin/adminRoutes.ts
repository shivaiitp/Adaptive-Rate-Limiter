import { Router } from "express";
import {
  getAllTierConfigs,
  getTierConfig,
  updateTierConfig,
  getAdaptiveConfig,
  updateAdaptiveConfig,
} from "../../config/configService";
import { getAllUsers, getUserTier, setUserTier, removeUser } from "../../config/userService";
import { getMetrics } from "../monitoring/metricsCollector";
import { getAdaptiveFactor } from "../rateLimiter/rateLimiter";
import { UserTier } from "../../types";

export const adminRouter = Router();

const VALID_TIERS: UserTier[] = ["free", "pro", "enterprise"];

// ─── Tier Config ────────────────────────────────────────────

adminRouter.get("/config/tiers", (_, res) => {
  res.json(getAllTierConfigs());
});

adminRouter.get("/config/tiers/:tier", (req, res) => {
  const tier = req.params.tier as UserTier;
  const config = getTierConfig(tier);
  if (!config) return res.status(404).json({ error: "Tier not found" });
  res.json(config);
});

adminRouter.put("/config/tiers/:tier", (req, res) => {
  const tier = req.params.tier as UserTier;
  if (!VALID_TIERS.includes(tier)) {
    return res.status(400).json({ error: "Invalid tier" });
  }
  const updated = updateTierConfig({ ...req.body, tier });
  res.json(updated);
});

// ─── Adaptive Config ────────────────────────────────────────

adminRouter.get("/config/adaptive", (_, res) => {
  res.json({
    ...getAdaptiveConfig(),
    currentFactor: getAdaptiveFactor(),
  });
});

adminRouter.put("/config/adaptive", (req, res) => {
  const updated = updateAdaptiveConfig(req.body);
  res.json(updated);
});

// ─── Users ──────────────────────────────────────────────────

adminRouter.get("/users", (_, res) => {
  res.json(getAllUsers());
});

adminRouter.put("/users/:userId", (req, res) => {
  const { userId } = req.params;
  const { tier } = req.body;
  if (!tier || !VALID_TIERS.includes(tier)) {
    return res.status(400).json({ error: "Invalid or missing tier" });
  }
  setUserTier(userId, tier);
  res.json({ userId, tier });
});

adminRouter.delete("/users/:userId", (req, res) => {
  const { userId } = req.params;
  const removed = removeUser(userId);
  if (!removed) return res.status(404).json({ error: "User not found" });
  res.json({ message: `User ${userId} removed` });
});

// ─── Metrics ────────────────────────────────────────────────

adminRouter.get("/metrics", (_, res) => {
  res.json({
    ...getMetrics(),
    adaptiveFactor: getAdaptiveFactor(),
  });
});
