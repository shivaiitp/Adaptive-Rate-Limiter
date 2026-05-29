import dotenv from "dotenv";
dotenv.config();

import { app } from "./app";
import "./core/redis/client";
import { logger } from "./core/logger";
import { loadScripts } from "./core/redis/scripts";
import { startMetricsCollection } from "./modules/monitoring/metricsCollector";
import { startAdaptiveThrottling } from "./modules/adaptive/adaptiveThrottler";

const PORT = process.env.PORT || 3000;

const start = async () => {
  try {
    await loadScripts();
  } catch (err) {
    logger.warn("Redis scripts could not be loaded at startup; requests will fail open until Redis is available", err);
  }

  startMetricsCollection();
  startAdaptiveThrottling();

  app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
  });
};

start();
