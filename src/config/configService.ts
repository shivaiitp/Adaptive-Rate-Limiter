import {
  TierConfig,
  AdaptiveConfig,
  RateLimitRule,
  UserTier,
  EndpointOverride,
} from "../types";
import { DEFAULT_TIER_CONFIGS, DEFAULT_ADAPTIVE_CONFIG } from "./defaults";
import { logger } from "../core/logger";

// In-memory config store - fast lookups, no DB calls on every request
// Updated at runtime via Admin API or polling

const tierMap = new Map<UserTier, TierConfig>();
let adaptiveConfig: AdaptiveConfig = { ...DEFAULT_ADAPTIVE_CONFIG };

// Initialize with defaults
const init = () => {
  for (const tier of DEFAULT_TIER_CONFIGS) {
    tierMap.set(tier.tier, { ...tier });
  }
};

init();

//Tier Configuration Management

export const getTierConfig = (tier: UserTier): TierConfig | undefined => {
  return tierMap.get(tier);
};

export const getAllTierConfigs = (): TierConfig[] => {
  return Array.from(tierMap.values());
};

export const updateTierConfig = (updated: Partial<TierConfig> & { tier: UserTier }): TierConfig => {
  const existing = tierMap.get(updated.tier);

  const merged: TierConfig = {
    tier: updated.tier,
    default: updated.default ?? existing?.default ?? { capacity: 5, refillRate: 1 },
    endpoints: updated.endpoints ?? existing?.endpoints ?? [],
    adaptiveMinFactor: updated.adaptiveMinFactor ?? existing?.adaptiveMinFactor ?? 0.3,
  };

  tierMap.set(updated.tier, merged);
  logger.info(`Config updated for tier: ${updated.tier}`);
  return merged;
};

// Rule Lookup
// This is what the rate limiter calls on every request.
// Checks for endpoint-specific override first, falls back to tier default.

export const getRuleForRequest = (tier: UserTier, endpoint: string): RateLimitRule => {
  const config = tierMap.get(tier);

  if (!config) {
    return { capacity: 5, refillRate: 1 };
  }

  const override = config.endpoints?.find((e: EndpointOverride) => {
    return endpoint === e.endpoint || endpoint.startsWith(e.endpoint + "/");
  });
  return override ? override.rule : config.default;
};

export const getMatchedEndpointKey = (tier: UserTier, endpoint: string): string => {
  const config = tierMap.get(tier);
  if (!config) return "default";

  const override = config.endpoints?.find((e: EndpointOverride) => {
    return endpoint === e.endpoint || endpoint.startsWith(e.endpoint + "/");
  });
  return override ? override.endpoint : "default";
};

export const getAdaptiveMinFactor = (tier: UserTier): number => {
  return tierMap.get(tier)?.adaptiveMinFactor ?? 0.3;
};

//Adaptive Config

export const getAdaptiveConfig = (): AdaptiveConfig => {
  return adaptiveConfig;
};

export const updateAdaptiveConfig = (updated: Partial<AdaptiveConfig>): AdaptiveConfig => {
  adaptiveConfig = { ...adaptiveConfig, ...updated };
  logger.info("Adaptive config updated");
  return adaptiveConfig;
};

// Reset (useful for testing)

export const resetToDefaults = () => {
  tierMap.clear();
  init();
  adaptiveConfig = { ...DEFAULT_ADAPTIVE_CONFIG };
};
