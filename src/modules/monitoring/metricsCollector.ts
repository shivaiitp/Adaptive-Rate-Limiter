import os from "os";
import { SystemMetrics } from "../../types";
import { logger } from "../../core/logger";

// Rolling window counters - reset every evaluation cycle
let totalRequests = 0;
let blockedRequests = 0;
let serverErrors = 0;
let totalLatency = 0;
let windowStart = Date.now();

// Latest snapshot - consumed by adaptive throttler & admin dashboard
let currentMetrics: SystemMetrics = {
  cpuUsage: 0,
  memoryUsage: 0,
  avgLatency: 0,
  errorRate: 0,
  requestsPerSecond: 0,
  blockedRequests: 0,
  totalRequests: 0,
  timestamp: Date.now(),
};

// Called by the middleware on every request
// blocked = rate-limited (429), serverError = actual failure (5xx / Redis down)
export const recordRequest = (blocked: boolean, latencyMs: number, serverError: boolean = false) => {
  totalRequests++;
  if (blocked) blockedRequests++;
  if (serverError) serverErrors++;
  totalLatency += latencyMs;
};

// CPU usage - track previous reading to compute delta (real-time usage)
let prevCpuIdle = 0;
let prevCpuTotal = 0;

const getCpuUsage = (): number => {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;

  for (const cpu of cpus) {
    idle += cpu.times.idle;
    total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.irq + cpu.times.idle;
  }

  const deltaIdle = idle - prevCpuIdle;
  const deltaTotal = total - prevCpuTotal;

  prevCpuIdle = idle;
  prevCpuTotal = total;

  if (deltaTotal === 0) return 0;
  return Math.round((1 - deltaIdle / deltaTotal) * 100);
};

const getMemoryUsage = (): number => {
  const total = os.totalmem();
  const free = os.freemem();
  return Math.round(((total - free) / total) * 100);
};

// Take a snapshot of current metrics and reset the rolling window
export const collectMetrics = (): SystemMetrics => {
  const now = Date.now();
  const windowDuration = (now - windowStart) / 1000; // seconds

  currentMetrics = {
    cpuUsage: getCpuUsage(),
    memoryUsage: getMemoryUsage(),
    avgLatency: totalRequests > 0 ? Math.round(totalLatency / totalRequests) : 0,
    errorRate: totalRequests > 0 ? serverErrors / totalRequests : 0,
    requestsPerSecond: windowDuration > 0 ? Math.round(totalRequests / windowDuration) : 0,
    blockedRequests,
    totalRequests,
    timestamp: now,
  };

  // Reset window
  totalRequests = 0;
  blockedRequests = 0;
  serverErrors = 0;
  totalLatency = 0;
  windowStart = now;

  return currentMetrics;
};

// Get a live view of metrics - merges current window data with system stats
// so the dashboard always sees up-to-date numbers, not a stale snapshot
export const getMetrics = (): SystemMetrics => {
  const now = Date.now();
  const windowDuration = (now - windowStart) / 1000;

  return {
    cpuUsage: getCpuUsage(),
    memoryUsage: getMemoryUsage(),
    avgLatency: totalRequests > 0 ? Math.round(totalLatency / totalRequests) : currentMetrics.avgLatency,
    errorRate: totalRequests > 0 ? serverErrors / totalRequests : currentMetrics.errorRate,
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
  logger.info(`Metrics collection started (every ${intervalMs}ms)`);
};

export const stopMetricsCollection = () => {
  if (collectionInterval) {
    clearInterval(collectionInterval);
    collectionInterval = null;
  }
};
