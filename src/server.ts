import dotenv from "dotenv";
dotenv.config();

import { app } from "./app";
import "./core/redis/client";
import { loadScripts } from "./core/redis/scripts";

const start = async () => {
  await loadScripts();

  app.listen(3000, () => {
    console.log("Server running on port 3000");
  });
};

start();