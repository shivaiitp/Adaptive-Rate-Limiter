import dotenv from "dotenv";
dotenv.config();

import { app } from "./app";
import "./core/redis/client";
import { loadScripts } from "./core/redis/scripts";
import { startMetricsCollection } from "./modules/monitoring/metricsCollector";
import { startAdaptiveThrottling } from "./modules/adaptive/adaptiveThrottler";

const PORT = process.env.PORT || 3000;

const start = async () => {
  await loadScripts();
  startMetricsCollection();
  startAdaptiveThrottling();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

start();