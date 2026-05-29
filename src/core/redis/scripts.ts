import { redis } from "./client";
import { logger } from "../logger";

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

-- refill tokens (now is in ms, refill_rate is tokens/sec - convert delta to seconds)
local delta = math.max(0, (now - last_refill) / 1000)
local refill = delta * refill_rate
tokens = math.min(capacity, tokens + refill)

-- check if request can be allowed
local allowed = 0
if tokens >= 1 then
  allowed = 1
  tokens = tokens - 1
end

-- update state
redis.call("HSET", key,
  "tokens", tokens,
  "last_refill", now
)

local ttl = 60
if refill_rate > 0 then
  ttl = math.max(60, math.ceil((capacity / refill_rate) * 2))
end
redis.call("EXPIRE", key, ttl)

return {allowed, tokens, refill_rate}
`;

let tokenBucketScriptSha: string | undefined;

const isNoScriptError = (err: unknown): boolean => {
  return err instanceof Error && err.message.includes("NOSCRIPT");
};

export const loadScripts = async () => {
  tokenBucketScriptSha = await redis.script("LOAD", TOKEN_BUCKET_SCRIPT) as string;
  logger.info("Lua script loaded:", tokenBucketScriptSha);
};

const getTokenBucketScriptSha = async (): Promise<string> => {
  if (!tokenBucketScriptSha) {
    await loadScripts();
  }

  if (!tokenBucketScriptSha) {
    throw new Error("Redis Lua script SHA is unavailable");
  }

  return tokenBucketScriptSha;
};

export const runTokenBucketScript = async (key: string, capacity: number, refillRate: number, now: number) => {
  let scriptSha = await getTokenBucketScriptSha();

  let rawResult: unknown;
  try {
    rawResult = await redis.evalsha(scriptSha, 1, key, capacity.toString(), refillRate.toString(), now.toString());
  } catch (err) {
    if (!isNoScriptError(err)) {
      throw err;
    }
    logger.warn("Redis Lua script cache missed; reloading script");
    await loadScripts();
    scriptSha = await getTokenBucketScriptSha();
    rawResult = await redis.evalsha(scriptSha, 1, key, capacity.toString(), refillRate.toString(), now.toString());
  }

  if (!Array.isArray(rawResult) || rawResult.length < 3) {
    throw new Error("Unexpected Redis script return value");
  }

  const [allowed, tokens, refillRateResult] = rawResult.map((value) => Number(value)) as [number, number, number];
  return [allowed, tokens, refillRateResult];
};
