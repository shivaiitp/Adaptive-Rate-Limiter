import express from "express";
import { rateLimiter } from "./middleware/rateLimiterMiddleware";

export const app = express();

app.use(rateLimiter);

app.get("/test", (_, res) => {
  res.send("Request allowed");
});