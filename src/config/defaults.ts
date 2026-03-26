import { TierConfig, AdaptiveConfig } from "../types";

// Default rate limits per tier — used on first startup
// Admin API can override these at runtime without restart

export const DEFAULT_TIER_CONFIGS: TierConfig[] = [
  {
    tier: "free",
    default: { capacity: 5, refillRate: 1 },
    endpoints: [
      { endpoint: "/api/login", rule: { capacity: 3, refillRate: 0.5 } },
    ],
    adaptiveMinFactor: 0.3,
  },
  {
    tier: "pro",
    default: { capacity: 50, refillRate: 10 },
    endpoints: [
      { endpoint: "/api/login", rule: { capacity: 20, refillRate: 5 } },
    ],
    adaptiveMinFactor: 0.5,
  },
  {
    tier: "enterprise",
    default: { capacity: 500, refillRate: 100 },
    endpoints: [
      { endpoint: "/api/login", rule: { capacity: 100, refillRate: 30 } },
    ],
    adaptiveMinFactor: 0.8,
  },
];

export const DEFAULT_ADAPTIVE_CONFIG: AdaptiveConfig = {
  enabled: true,
  cpuThresholdHigh: 80,
  cpuThresholdLow: 40,
  latencyThresholdMs: 500,
  errorRateThreshold: 0.1,
  minFactor: 0.3,
  maxFactor: 1.0,
  adjustmentStep: 0.05,
  evaluationIntervalMs: 5000,
};
