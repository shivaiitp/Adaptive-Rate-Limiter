import os from "os";
import { SystemMetrics } from "../../types";
import { logger } from "../../core/logger";

// Rolling window counters - reset every evaluation cycle
let totalRequests = 0;
let blockedRequests = 0;
let serverErrors = 0;
let infraErrors = 0;
let totalLatency = 0;
let windowStart = Date.now();

// Latest snapshot - consumed by adaptive throttler & admin dashboard
let currentMetrics: SystemMetrics = {
  cpuUsage: 0,
  memoryUsage: 0,
  avgLatency: 0,
  errorRate: 0,
  infraErrors: 0,
  requestsPerSecond: 0,
  blockedRequests: 0,
  totalRequests: 0,
  timestamp: Date.now(),
};

// Called by the middleware on every request.
// blocked = rate-limited (429), serverError = actual user-visible failure (5xx)
// infraError = rate limiter infrastructure failure (Redis down, fail-open)
export const recordRequest = (
  blocked: boolean,
  latencyMs: number,
  serverError: boolean = false,
  infraError: boolean = false
) => {
  totalRequests++;
  if (blocked) blockedRequests++;
  if (serverError) serverErrors++;
  if (infraError) infraErrors++;
  totalLatency += latencyMs;
};

// ── CPU Usage (process-level) ────────────────────────────────────────────────
// Uses process.cpuUsage() which measures only THIS Node.js process, not the
// whole machine. This is what matters for rate limiting — we want to throttle
// when OUR server is under load, not because some other process is busy.
//
// process.cpuUsage() returns cumulative microseconds of user+system time.
// We track deltas between readings to get real-time usage over the interval.

let prevCpuUsage = process.cpuUsage();
let prevCpuTime  = Date.now();

const getProcessCpuPercent = (): number => {
  const now     = Date.now();
  const current = process.cpuUsage(prevCpuUsage); // delta since prevCpuUsage

  const elapsedUs = (now - prevCpuTime) * 1000; // ms → µs
  const usedUs    = current.user + current.system;

  prevCpuUsage = process.cpuUsage();
  prevCpuTime  = now;

  if (elapsedUs <= 0) return 0;

  // Multiply by 100 for %; clamp to 100 (can slightly exceed on multi-core
  // because user+system time counts all threads).
  return Math.min(100, Math.round((usedUs / elapsedUs) * 100));
};

// Seed the baseline so the first real reading is accurate (not 0%).
// Called once at module load — the very first process.cpuUsage() call above
// already captures the baseline, so no extra work needed here.

// ── Memory Usage ─────────────────────────────────────────────────────────────
// Shows process heap usage vs. total system memory — gives a realistic view
// of how much memory this Node.js process is consuming.

const getMemoryUsage = (): number => {
  const heapUsed  = process.memoryUsage().heapUsed;
  const totalMem  = os.totalmem();
  return Math.min(100, Math.round((heapUsed / totalMem) * 100));
};

// ── Metrics Collection ────────────────────────────────────────────────────────

// Take a snapshot of current metrics and reset the rolling window
export const collectMetrics = (): SystemMetrics => {
  const now = Date.now();
  const windowDuration = (now - windowStart) / 1000; // seconds

  currentMetrics = {
    cpuUsage: getProcessCpuPercent(),
    memoryUsage: getMemoryUsage(),
    avgLatency: totalRequests > 0 ? Math.round(totalLatency / totalRequests) : 0,
    errorRate: totalRequests > 0 ? serverErrors / totalRequests : 0,
    infraErrors,
    requestsPerSecond: windowDuration > 0 ? Math.round(totalRequests / windowDuration) : 0,
    blockedRequests,
    totalRequests,
    timestamp: now,
  };

  logger.debug("Metrics snapshot collected", {
    rps: currentMetrics.requestsPerSecond,
    blocked: currentMetrics.blockedRequests,
    avgLatencyMs: currentMetrics.avgLatency,
    errorRate: +(currentMetrics.errorRate * 100).toFixed(2) + "%",
    cpu: currentMetrics.cpuUsage + "%",
    mem: currentMetrics.memoryUsage + "%",
    infraErrors: currentMetrics.infraErrors,
    windowMs: Math.round(windowDuration * 1000),
  });

  // Log a warning if infra errors occurred in this window
  if (currentMetrics.infraErrors > 0) {
    logger.warn("Infra errors detected in metrics window", {
      infraErrors: currentMetrics.infraErrors,
      windowMs: Math.round(windowDuration * 1000),
    });
  }

  // Reset window
  totalRequests = 0;
  blockedRequests = 0;
  serverErrors = 0;
  infraErrors = 0;
  totalLatency = 0;
  windowStart = now;

  return currentMetrics;
};

// Live view — uses cached CPU/memory from the last collection,
// merged with current-window request stats so the dashboard sees
// up-to-the-second numbers without racing the CPU sampler.
export const getMetrics = (): SystemMetrics => {
  const now = Date.now();
  const windowDuration = (now - windowStart) / 1000;

  return {
    cpuUsage: currentMetrics.cpuUsage,
    memoryUsage: currentMetrics.memoryUsage,
    avgLatency: totalRequests > 0 ? Math.round(totalLatency / totalRequests) : currentMetrics.avgLatency,
    errorRate: totalRequests > 0 ? serverErrors / totalRequests : currentMetrics.errorRate,
    infraErrors: totalRequests > 0 ? infraErrors : currentMetrics.infraErrors,
    requestsPerSecond: windowDuration > 0 ? +(totalRequests / windowDuration).toFixed(1) : 0,
    blockedRequests: totalRequests > 0 ? blockedRequests : currentMetrics.blockedRequests,
    totalRequests: totalRequests > 0 ? totalRequests : currentMetrics.totalRequests,
    timestamp: now,
  };
};

// Start automatic collection on an interval (called once at server startup)
let collectionInterval: ReturnType<typeof setInterval> | null = null;

export const startMetricsCollection = (intervalMs: number = 5000) => {
  if (collectionInterval) return;
  collectionInterval = setInterval(collectMetrics, intervalMs);
  logger.info("Metrics collection started", { intervalMs, cpuMode: "process" });
};

export const stopMetricsCollection = () => {
  if (collectionInterval) {
    clearInterval(collectionInterval);
    collectionInterval = null;
    logger.info("Metrics collection stopped");
  }
};
