export type UserTier = "free" | "pro" | "enterprise";

export interface RateLimitRule {
  capacity: number;
  refillRate: number;       // tokens per second
}

export interface EndpointOverride {
  endpoint: string;
  rule: RateLimitRule;
}

// adaptiveMinFactor: floor for adaptive scaling (enterprise=0.8, free=0.3)
export interface TierConfig {
  tier: UserTier;
  default: RateLimitRule;
  endpoints?: EndpointOverride[];
  adaptiveMinFactor: number;
}

export interface RateLimitConfig {
  tiers: TierConfig[];
}

export interface RateLimitResult {
  allowed: boolean;
  tokens: number;
  limit: number;
  retryAfter: number;       // seconds until next token (0 if allowed)
  refillRate: number;       // tokens per second (after adaptive scaling)
}

// IETF RateLimit header draft standard
export interface RateLimitHeaders {
  "X-RateLimit-Limit": number;
  "X-RateLimit-Remaining": number;
  "X-RateLimit-Reset": number;
  "Retry-After"?: number;
}

// Snapshot of system health - used by adaptive throttler
export interface SystemMetrics {
  cpuUsage: number;           // 0-100
  memoryUsage: number;        // 0-100
  avgLatency: number;         // ms
  errorRate: number;          // 0-1
  requestsPerSecond: number;
  blockedRequests: number;
  totalRequests: number;
  timestamp: number;
}

// Adaptive factor scales rate limits: 1.0 = normal, 0.5 = half limits
export interface AdaptiveConfig {
  enabled: boolean;
  cpuThresholdHigh: number;
  cpuThresholdLow: number;
  latencyThresholdMs: number;
  errorRateThreshold: number;
  minFactor: number;
  maxFactor: number;
  adjustmentStep: number;
  evaluationIntervalMs: number;
}

export interface RequestInfo {
  userId: string;
  tier: UserTier;
  endpoint: string;
  ip: string;
}

// Admin API payloads
export interface UpdateTierConfigRequest {
  tier: UserTier;
  default?: RateLimitRule;
  endpoints?: EndpointOverride[];
  adaptiveMinFactor?: number;
}

export interface UpdateAdaptiveConfigRequest {
  enabled?: boolean;
  cpuThresholdHigh?: number;
  cpuThresholdLow?: number;
  latencyThresholdMs?: number;
  errorRateThreshold?: number;
  minFactor?: number;
  maxFactor?: number;
  adjustmentStep?: number;
  evaluationIntervalMs?: number;
}

export interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  redis: boolean;
  uptime: number;
  adaptiveFactor: number;
  timestamp: number;
}

export interface AuthenticatedUser {
  userId: string;
  tier: UserTier;
}
