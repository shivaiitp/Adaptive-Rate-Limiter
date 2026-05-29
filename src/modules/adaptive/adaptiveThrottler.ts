import { getAdaptiveConfig } from "../../config/configService";
import { getMetrics } from "../monitoring/metricsCollector";
import { setAdaptiveFactor, getAdaptiveFactor } from "../rateLimiter/rateLimiter";
import { logger } from "../../core/logger";

// Periodically evaluate system health and adjust the adaptive factor

const evaluate = () => {
  const config = getAdaptiveConfig();
  if (!config.enabled) return;

  const metrics = getMetrics();
  const currentFactor = getAdaptiveFactor();

  const stressed =
    metrics.cpuUsage > config.cpuThresholdHigh ||
    metrics.avgLatency > config.latencyThresholdMs ||
    metrics.errorRate > config.errorRateThreshold;

  const healthy =
    metrics.cpuUsage < config.cpuThresholdLow &&
    metrics.avgLatency < config.latencyThresholdMs &&
    metrics.errorRate < config.errorRateThreshold;

  let newFactor: number;

  if (stressed) {
    newFactor = Math.max(config.minFactor, currentFactor - config.adjustmentStep);
  } else if (healthy) {
    newFactor = Math.min(config.maxFactor, currentFactor + config.adjustmentStep);
  } else {
    return; // dead zone - hold steady
  }

  if (newFactor !== currentFactor) {
    setAdaptiveFactor(newFactor);
    logger.info(
      `Adaptive factor: ${currentFactor.toFixed(2)} -> ${newFactor.toFixed(2)} | ` +
      `CPU: ${metrics.cpuUsage}% | Latency: ${metrics.avgLatency}ms | ErrorRate: ${(metrics.errorRate * 100).toFixed(1)}%`
    );
  }
};

let evaluationInterval: ReturnType<typeof setInterval> | null = null;

export const startAdaptiveThrottling = () => {
  const config = getAdaptiveConfig();
  if (!config.enabled) {
    logger.info("Adaptive throttling is disabled");
    return;
  }

  if (evaluationInterval) return;
  evaluationInterval = setInterval(evaluate, config.evaluationIntervalMs);
  logger.info(`Adaptive throttling started (every ${config.evaluationIntervalMs}ms)`);
};

export const stopAdaptiveThrottling = () => {
  if (evaluationInterval) {
    clearInterval(evaluationInterval);
    evaluationInterval = null;
  }
};

export const restartAdaptiveThrottling = () => {
  stopAdaptiveThrottling();
  startAdaptiveThrottling();
};
