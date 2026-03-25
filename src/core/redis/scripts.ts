import { redis } from "./client";

const TOKEN_BUCKET_SCRIPT = `
local key = KEYS[1]

local capacity = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

-- fetch current state
local data = redis.call("HMGET", key, "tokens", "last_refill")
local tokens = tonumber(data[1])
local last_refill = tonumber(data[2])

if tokens == nil then
  tokens = capacity
  last_refill = now
end

-- refill tokens
local delta = math.max(0, now - last_refill)
local refill = delta * refill_rate
tokens = math.min(capacity, tokens + refill)

-- check if request can be allowed
local allowed = 0
if tokens >= 1 then
  allowed = 1
  tokens = tokens - 1
end

-- update state
redis.call("HMSET", key,
  "tokens", tokens,
  "last_refill", now
)

redis.call("EXPIRE", key, 60)

return {allowed, tokens}
`;

let tokenBucketScriptSha: string;

export const loadScripts = async () => {
  tokenBucketScriptSha = await redis.script("LOAD", TOKEN_BUCKET_SCRIPT) as string;
  console.log("✅ Lua script loaded:", tokenBucketScriptSha);
};

export const runTokenBucketScript = async (key: string, capacity: number, refillRate: number, now: number) => {
  return redis.evalsha(tokenBucketScriptSha, 1, key, capacity.toString(), refillRate.toString(), now.toString());
};