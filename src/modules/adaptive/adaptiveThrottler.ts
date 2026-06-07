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
    logger.warn("System under stress — reducing adaptive factor", {
      from: +currentFactor.toFixed(2),
      to: +newFactor.toFixed(2),
      cpu: metrics.cpuUsage + "%",
      latencyMs: metrics.avgLatency,
      errorRate: +(metrics.errorRate * 100).toFixed(2) + "%",
      triggers: {
        highCpu: metrics.cpuUsage > config.cpuThresholdHigh,
        highLatency: metrics.avgLatency > config.latencyThresholdMs,
        highErrorRate: metrics.errorRate > config.errorRateThreshold,
      },
    });
  } else if (healthy) {
    newFactor = Math.min(config.maxFactor, currentFactor + config.adjustmentStep);
    logger.info("System healthy — increasing adaptive factor", {
      from: +currentFactor.toFixed(2),
      to: +newFactor.toFixed(2),
      cpu: metrics.cpuUsage + "%",
      latencyMs: metrics.avgLatency,
    });
  } else {
    // Dead zone — hold steady to prevent oscillation
    logger.debug("Adaptive factor in dead zone — holding steady", {
      factor: +currentFactor.toFixed(2),
      cpu: metrics.cpuUsage + "%",
      latencyMs: metrics.avgLatency,
    });
    return;
  }

  if (newFactor !== currentFactor) {
    setAdaptiveFactor(newFactor);
  }
};

let evaluationInterval: ReturnType<typeof setInterval> | null = null;

export const startAdaptiveThrottling = () => {
  const config = getAdaptiveConfig();
  if (!config.enabled) {
    logger.info("Adaptive throttling is disabled — skipping start");
    return;
  }

  if (evaluationInterval) {
    logger.debug("Adaptive throttling already running");
    return;
  }

  evaluationInterval = setInterval(evaluate, config.evaluationIntervalMs);
  logger.info("Adaptive throttling started", {
    intervalMs: config.evaluationIntervalMs,
    cpuThresholds: { low: config.cpuThresholdLow, high: config.cpuThresholdHigh },
    latencyThresholdMs: config.latencyThresholdMs,
    errorRateThreshold: config.errorRateThreshold,
    factorRange: { min: config.minFactor, max: config.maxFactor },
    adjustmentStep: config.adjustmentStep,
  });
};

export const stopAdaptiveThrottling = () => {
  if (evaluationInterval) {
    clearInterval(evaluationInterval);
    evaluationInterval = null;
    logger.info("Adaptive throttling stopped");
  }
};

export const restartAdaptiveThrottling = () => {
  logger.info("Adaptive throttling restarting due to config change");
  stopAdaptiveThrottling();
  startAdaptiveThrottling();
};
