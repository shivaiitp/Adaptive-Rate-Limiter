import Redis from "ioredis";

export const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),

  maxRetriesPerRequest: 3,

  retryStrategy: (times) => {
    return Math.min(times * 50, 2000); // exponential backoff
  },
});

redis.on("connect", () => {
  console.log("✅ Redis connected");
});

redis.on("error", (err) => {
  console.error("❌ Redis error:", err);
});