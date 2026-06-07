import {
  TierConfig,
  AdaptiveConfig,
  RateLimitRule,
  UserTier,
  EndpointOverride,
} from "../types";
import { DEFAULT_TIER_CONFIGS, DEFAULT_ADAPTIVE_CONFIG } from "./defaults";
import { logger } from "../core/logger";

// In-memory config store — fast O(1) lookups on every request, no DB calls.
// Updated at runtime via the Admin API.

const tierMap = new Map<UserTier, TierConfig>();
let adaptiveConfig: AdaptiveConfig = { ...DEFAULT_ADAPTIVE_CONFIG };

// Initialize with defaults
const init = () => {
  for (const tier of DEFAULT_TIER_CONFIGS) {
    tierMap.set(tier.tier, { ...tier });
  }
  logger.debug("Config service initialised", {
    tiers: DEFAULT_TIER_CONFIGS.map((t) => t.tier),
  });
};

init();

// ── Tier Configuration Management ────────────────────────────────────────────

export const getTierConfig = (tier: UserTier): TierConfig | undefined => {
  return tierMap.get(tier);
};

export const getAllTierConfigs = (): TierConfig[] => {
  return Array.from(tierMap.values());
};

export const updateTierConfig = (
  updated: Partial<TierConfig> & { tier: UserTier }
): TierConfig => {
  const existing = tierMap.get(updated.tier);

  const merged: TierConfig = {
    tier: updated.tier,
    default: updated.default ?? existing?.default ?? { capacity: 5, refillRate: 1 },
    endpoints: updated.endpoints ?? existing?.endpoints ?? [],
    adaptiveMinFactor: updated.adaptiveMinFactor ?? existing?.adaptiveMinFactor ?? 0.3,
  };

  tierMap.set(updated.tier, merged);
  logger.info("Tier config updated", {
    tier: updated.tier,
    default: merged.default,
    endpointOverrides: merged.endpoints?.length ?? 0,
    adaptiveMinFactor: merged.adaptiveMinFactor,
  });
  return merged;
};

// ── Rule Lookup ───────────────────────────────────────────────────────────────
// Called on every request — checks for endpoint-specific override first,
// falls back to tier default.

export const getRuleForRequest = (tier: UserTier, endpoint: string): RateLimitRule => {
  const config = tierMap.get(tier);

  if (!config) {
    logger.warn("No config found for tier — using hard fallback", { tier, endpoint });
    return { capacity: 5, refillRate: 1 };
  }

  const override = config.endpoints?.find((e: EndpointOverride) =>
    endpoint === e.endpoint || endpoint.startsWith(e.endpoint + "/")
  );

  const rule = override ? override.rule : config.default;

  logger.debug("Rule resolved for request", {
    tier,
    endpoint,
    matchedOverride: override?.endpoint ?? "default",
    capacity: rule.capacity,
    refillRate: rule.refillRate,
  });

  return rule;
};

export const getMatchedEndpointKey = (tier: UserTier, endpoint: string): string => {
  const config = tierMap.get(tier);
  if (!config) return "default";

  const override = config.endpoints?.find((e: EndpointOverride) =>
    endpoint === e.endpoint || endpoint.startsWith(e.endpoint + "/")
  );
  return override ? override.endpoint : "default";
};

export const getAdaptiveMinFactor = (tier: UserTier): number => {
  return tierMap.get(tier)?.adaptiveMinFactor ?? 0.3;
};

// ── Adaptive Config ───────────────────────────────────────────────────────────

export const getAdaptiveConfig = (): AdaptiveConfig => {
  return adaptiveConfig;
};

export const updateAdaptiveConfig = (updated: Partial<AdaptiveConfig>): AdaptiveConfig => {
  const previous = { ...adaptiveConfig };
  adaptiveConfig = { ...adaptiveConfig, ...updated };
  logger.info("Adaptive config updated", { previous, next: adaptiveConfig });
  return adaptiveConfig;
};

// ── Reset (used in tests) ─────────────────────────────────────────────────────

export const resetToDefaults = () => {
  tierMap.clear();
  init();
  adaptiveConfig = { ...DEFAULT_ADAPTIVE_CONFIG };
  logger.debug("Config service reset to defaults");
};
