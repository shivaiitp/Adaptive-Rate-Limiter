import { RateLimitResult, RateLimitRule, UserTier } from "../../types";
import { getRuleAndKey, getAdaptiveMinFactor } from "../../config/configService";
import { runTokenBucketScript } from "../../core/redis/scripts";
import { logger } from "../../core/logger";

// Current adaptive factor — updated by the adaptive throttler.
// 1.0 = full limits, 0.5 = half limits, etc.
let adaptiveFactor = 1.0;

export const setAdaptiveFactor = (factor: number) => {
  if (!Number.isFinite(factor)) {
    logger.warn("setAdaptiveFactor called with non-finite value — ignoring", { factor });
    return;
  }
  const clamped = Math.max(0, factor);
  if (clamped !== adaptiveFactor) {
    logger.info("Adaptive factor changed", {
      from: +adaptiveFactor.toFixed(3),
      to: +clamped.toFixed(3),
    });
    adaptiveFactor = clamped;
  }
};

export const getAdaptiveFactor = (): number => adaptiveFactor;

// Apply adaptive scaling to a rule, respecting the tier's minimum factor
const applyAdaptiveScaling = (rule: RateLimitRule, tier: UserTier): RateLimitRule => {
  const minFactor = getAdaptiveMinFactor(tier);
  const effectiveFactor = Math.max(minFactor, adaptiveFactor);

  const scaled = {
    capacity:   Math.max(1, Math.floor(rule.capacity * effectiveFactor)),
    refillRate: Math.max(0.001, rule.refillRate * effectiveFactor),
  };

  if (effectiveFactor < 1) {
    logger.debug("Adaptive scaling applied", {
      tier,
      rawCapacity: rule.capacity,
      scaledCapacity: scaled.capacity,
      rawRefillRate: rule.refillRate,
      scaledRefillRate: +scaled.refillRate.toFixed(4),
      adaptiveFactor: +adaptiveFactor.toFixed(3),
      effectiveFactor: +effectiveFactor.toFixed(3),
      minFactor,
    });
  }

  return scaled;
};

export const checkRateLimit = async (
  userId: string,
  tier: UserTier,
  endpoint: string
): Promise<RateLimitResult> => {
  // Single config scan — rule + Redis key suffix in one pass
  const { rule: baseRule, endpointKey } = getRuleAndKey(tier, endpoint);
  const scaledRule = applyAdaptiveScaling(baseRule, tier);

  const key = `rate_limit:${userId}:${endpointKey}`;
  const now = Date.now();

  const result = await runTokenBucketScript(key, scaledRule.capacity, scaledRule.refillRate, now);
  const allowed     = result[0] === 1;
  const tokens      = result[1];
  const retryAfterMs = result[2] ?? 0;

  return {
    allowed,
    tokens,
    limit:      scaledRule.capacity,
    retryAfter: Math.max(0, Math.ceil(retryAfterMs / 1000)),
    refillRate: scaledRule.refillRate,
  };
};
