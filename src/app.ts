import express from "express";
import path from "path";
import { rateLimiter } from "./middleware/rateLimiterMiddleware";
import { adminRouter } from "./modules/admin/adminRoutes";
import { healthRouter } from "./modules/admin/healthRoute";
import { logger } from "./core/logger";

export const app = express();

app.use(express.json());

// Request logger — logs every inbound request before it hits any route
app.use((req, _, next) => {
  logger.debug("Incoming request", {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
  });
  next();
});

// Serve admin dashboard static files
app.use("/admin", express.static(path.join(__dirname, "../public")));

// Health check (no rate limiting)
app.use(healthRouter);

// Admin API uses its own optional x-admin-api-key guard.
app.use("/api/admin", adminRouter);

// Rate limiter applies to demo API routes below.
app.use(rateLimiter);

// Demo endpoints
app.get("/test", (_, res) => {
  logger.debug("Demo /test hit");
  res.json({ message: "Request allowed", timestamp: Date.now() });
});

app.get("/api/data", (_, res) => {
  logger.debug("Demo /api/data hit");
  res.json({ data: "Sample data response", timestamp: Date.now() });
});

app.post("/api/login", (_, res) => {
  logger.debug("Demo /api/login hit");
  res.json({ message: "Login successful", timestamp: Date.now() });
});
