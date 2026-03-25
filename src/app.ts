import express from "express";
import { runTokenBucketScript } from "./core/redis/scripts";

export const app = express();

app.get("/test", async (_, res) => {
  const val = await runTokenBucketScript("test_key", 10, 1, Date.now());
  res.json({ val });
});