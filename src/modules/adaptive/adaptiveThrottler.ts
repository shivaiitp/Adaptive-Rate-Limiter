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

  let shouldReduce = false;

  if (metrics.cpuUsage > config.cpuThresholdHigh) shouldReduce = true;
  if (metrics.avgLatency > config.latencyThresholdMs) shouldReduce = true;
  if (metrics.errorRate > config.errorRateThreshold) shouldReduce = true;

  let newFactor: number;

  if (shouldReduce) {
    // System under stress - reduce limits
    newFactor = Math.max(config.minFactor, currentFactor - config.adjustmentStep);
  } else if (metrics.cpuUsage < config.cpuThresholdLow) {
    // System healthy - restore limits gradually
    newFactor = Math.min(config.maxFactor, currentFactor + config.adjustmentStep);
  } else {
    // In between thresholds - hold steady
    return;
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
