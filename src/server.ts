import dotenv from "dotenv";
dotenv.config();

import { app } from "./app";
import "./core/redis/client";
import { logger } from "./core/logger";
import { loadScripts } from "./core/redis/scripts";
import { startMetricsCollection } from "./modules/monitoring/metricsCollector";
import { startAdaptiveThrottling } from "./modules/adaptive/adaptiveThrottler";

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || "development";

const start = async () => {
  logger.info("Starting server", { port: PORT, env: NODE_ENV });

  try {
    logger.debug("Loading Redis Lua scripts...");
    await loadScripts();
  } catch (err) {
    logger.warn(
      "Redis Lua scripts could not be loaded at startup — requests will fail open until Redis is available",
      err
    );
  }

  startMetricsCollection();
  startAdaptiveThrottling();

  app.listen(PORT, () => {
    logger.info("Server ready", { port: PORT, env: NODE_ENV });
  });
};

start().catch((err) => {
  logger.error("Fatal error during startup — exiting", err);
  process.exit(1);
});

// Graceful shutdown
const shutdown = (signal: string) => {
  logger.info("Shutdown signal received", { signal });
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
