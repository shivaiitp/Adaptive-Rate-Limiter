import express from "express";
import path from "path";
import { rateLimiter } from "./middleware/rateLimiterMiddleware";
import { adminRouter } from "./modules/admin/adminRoutes";
import { healthRouter } from "./modules/admin/healthRoute";

export const app = express();

app.use(express.json());

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
  res.json({ message: "Request allowed", timestamp: Date.now() });
});

app.get("/api/data", (_, res) => {
  res.json({ data: "Sample data response", timestamp: Date.now() });
});

app.post("/api/login", (_, res) => {
  res.json({ message: "Login successful", timestamp: Date.now() });
});
