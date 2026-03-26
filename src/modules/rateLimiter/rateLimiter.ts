import { RateLimitResult, RateLimitRule, UserTier } from "../../types";
import { getRuleForRequest, getAdaptiveMinFactor } from "../../config/configService";
import { runTokenBucketScript } from "../../core/redis/scripts";

// Current adaptive factor — updated by the adaptive throttler (Step 5)
// 1.0 = normal, 0.5 = half limits, etc.
let adaptiveFactor = 1.0;

export const setAdaptiveFactor = (factor: number) => {
  adaptiveFactor = Math.max(0, Math.min(1, factor));
};

export const getAdaptiveFactor = (): number => adaptiveFactor;

// Apply adaptive scaling to a rule, respecting the tier's minimum factor
const applyAdaptiveScaling = (rule: RateLimitRule, tier: UserTier): RateLimitRule => {
  const minFactor = getAdaptiveMinFactor(tier);
  const effectiveFactor = Math.max(minFactor, adaptiveFactor);

  return {
    capacity: Math.max(1, Math.floor(rule.capacity * effectiveFactor)),
    refillRate: rule.refillRate * effectiveFactor,
  };
};

export const checkRateLimit = async (
  userId: string,
  tier: UserTier,
  endpoint: string
): Promise<RateLimitResult> => {
  const baseRule = getRuleForRequest(tier, endpoint);
  const scaledRule = applyAdaptiveScaling(baseRule, tier);

  const key = `rate_limit:${userId}:${endpoint}`;
  const now = Date.now();

  const result = await runTokenBucketScript(key, scaledRule.capacity, scaledRule.refillRate, now);
  const allowed = result[0] === 1;
  const tokens = result[1];
  const refillRate = result[2];

  // Retry-After: seconds until 1 token is available
  const retryAfter = allowed ? 0 : Math.ceil(1 / refillRate);

  return {
    allowed,
    tokens,
    limit: scaledRule.capacity,
    retryAfter,
  };
};
