import {
  AdaptiveConfig,
  EndpointOverride,
  RateLimitRule,
  TierConfig,
  UserTier,
} from "../types";

const VALID_TIERS: readonly UserTier[] = ["free", "pro", "enterprise"];
const USER_ID_PATTERN = /^[A-Za-z0-9._:-]{1,80}$/;

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export const isUserTier = (value: unknown): value is UserTier => {
  return typeof value === "string" && VALID_TIERS.includes(value as UserTier);
};

export const isValidUserId = (value: unknown): value is string => {
  return typeof value === "string" && USER_ID_PATTERN.test(value);
};

export const normalizeUserId = (value: unknown, fallback = "anonymous"): string => {
  const candidate = Array.isArray(value) ? value[0] : value;
  return isValidUserId(candidate) ? candidate : fallback;
};

const asRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
};

const hasOwn = (record: Record<string, unknown>, key: string): boolean => {
  return Object.prototype.hasOwnProperty.call(record, key);
};

const finiteNumber = (
  value: unknown,
  label: string,
  options: { min?: number; max?: number; integer?: boolean } = {}
): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ValidationError(`${label} must be a finite number`);
  }

  if (options.integer && !Number.isInteger(value)) {
    throw new ValidationError(`${label} must be an integer`);
  }

  if (options.min !== undefined && value < options.min) {
    throw new ValidationError(`${label} must be at least ${options.min}`);
  }

  if (options.max !== undefined && value > options.max) {
    throw new ValidationError(`${label} must be at most ${options.max}`);
  }

  return value;
};

export const parseRateLimitRule = (value: unknown, label = "rule"): RateLimitRule => {
  const record = asRecord(value, label);

  return {
    capacity: finiteNumber(record.capacity, `${label}.capacity`, {
      min: 1,
      max: 1_000_000,
      integer: true,
    }),
    refillRate: finiteNumber(record.refillRate, `${label}.refillRate`, {
      min: 0.001,
      max: 100_000,
    }),
  };
};

export const parseEndpointOverrides = (value: unknown): EndpointOverride[] => {
  if (!Array.isArray(value)) {
    throw new ValidationError("endpoints must be an array");
  }

  return value.map((item, index) => {
    const record = asRecord(item, `endpoints[${index}]`);
    const endpoint = record.endpoint;

    if (typeof endpoint !== "string" || !endpoint.startsWith("/") || endpoint.length > 200) {
      throw new ValidationError(`endpoints[${index}].endpoint must be a path starting with /`);
    }

    return {
      endpoint,
      rule: parseRateLimitRule(record.rule, `endpoints[${index}].rule`),
    };
  });
};

export const parseTierConfigUpdate = (
  value: unknown,
  tier: UserTier
): Partial<TierConfig> & { tier: UserTier } => {
  const record = asRecord(value, "tier config");
  const update: Partial<TierConfig> & { tier: UserTier } = { tier };

  if (hasOwn(record, "default")) {
    update.default = parseRateLimitRule(record.default, "default");
  }

  if (hasOwn(record, "endpoints")) {
    update.endpoints = parseEndpointOverrides(record.endpoints);
  }

  if (hasOwn(record, "adaptiveMinFactor")) {
    update.adaptiveMinFactor = finiteNumber(record.adaptiveMinFactor, "adaptiveMinFactor", {
      min: 0,
      max: 1,
    });
  }

  return update;
};

export const parseAdaptiveConfigUpdate = (
  value: unknown,
  current: AdaptiveConfig
): Partial<AdaptiveConfig> => {
  const record = asRecord(value, "adaptive config");
  const update: Partial<AdaptiveConfig> = {};

  if (hasOwn(record, "enabled")) {
    if (typeof record.enabled !== "boolean") {
      throw new ValidationError("enabled must be a boolean");
    }
    update.enabled = record.enabled;
  }

  const numberFields = {
    cpuThresholdHigh: { min: 0, max: 100 },
    cpuThresholdLow: { min: 0, max: 100 },
    latencyThresholdMs: { min: 1, max: 60_000 },
    errorRateThreshold: { min: 0, max: 1 },
    minFactor: { min: 0, max: 1 },
    maxFactor: { min: 0, max: 1 },
    adjustmentStep: { min: 0.001, max: 1 },
    evaluationIntervalMs: { min: 500, max: 3_600_000, integer: true },
  } satisfies Record<keyof Omit<AdaptiveConfig, "enabled">, { min: number; max: number; integer?: boolean }>;

  for (const [key, options] of Object.entries(numberFields)) {
    if (hasOwn(record, key)) {
      const typedKey = key as keyof Omit<AdaptiveConfig, "enabled">;
      update[typedKey] = finiteNumber(record[key], key, options);
    }
  }

  const next = { ...current, ...update };

  if (next.cpuThresholdLow > next.cpuThresholdHigh) {
    throw new ValidationError("cpuThresholdLow must be less than or equal to cpuThresholdHigh");
  }

  if (next.minFactor > next.maxFactor) {
    throw new ValidationError("minFactor must be less than or equal to maxFactor");
  }

  if (next.adjustmentStep > next.maxFactor - next.minFactor && next.minFactor !== next.maxFactor) {
    throw new ValidationError("adjustmentStep must fit within the min/max factor range");
  }

  return update;
};
