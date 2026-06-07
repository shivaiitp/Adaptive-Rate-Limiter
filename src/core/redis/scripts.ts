import { redis } from "./client";
import { logger } from "../logger";

const TOKEN_BUCKET_SCRIPT = `
local key = KEYS[1]

local capacity = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

local data = redis.call("HMGET", key, "tokens", "last_refill")
local tokens = tonumber(data[1])
local last_refill = tonumber(data[2])

if tokens == nil then
  tokens = capacity
  last_refill = now
end

local delta = math.max(0, (now - last_refill) / 1000)
local refill = delta * refill_rate
tokens = math.min(capacity, tokens + refill)

local allowed = 0
if tokens >= 1 then
  allowed = 1
  tokens = tokens - 1
end

redis.call("HSET", key,
  "tokens", tokens,
  "last_refill", now
)

local ttl = 60
if refill_rate > 0 then
  ttl = math.max(60, math.ceil((capacity / refill_rate) * 2))
end
redis.call("EXPIRE", key, ttl)

-- retry_after_ms: time until tokens >= 1 (0 if already allowed)
local retry_after_ms = 0
if allowed == 0 and refill_rate > 0 then
  retry_after_ms = math.ceil(((1 - tokens) / refill_rate) * 1000)
end

return {allowed, tokens, retry_after_ms}
`;

let tokenBucketScriptSha: string | undefined;

// Single inflight load promise — prevents the NOSCRIPT storm where dozens of
// concurrent requests all try to reload the script at the same time.
let loadPromise: Promise<void> | undefined;

const isNoScriptError = (err: unknown): boolean =>
  err instanceof Error && err.message.includes("NOSCRIPT");

export const loadScripts = async (): Promise<void> => {
  // If a load is already in flight, reuse it instead of spawning another.
  if (loadPromise) {
    await loadPromise;
    return;
  }

  loadPromise = (async () => {
    logger.debug("Loading Lua token-bucket script into Redis...");
    tokenBucketScriptSha = (await redis.script("LOAD", TOKEN_BUCKET_SCRIPT)) as string;
    logger.info("Lua script loaded", { sha: tokenBucketScriptSha });
  })().finally(() => {
    loadPromise = undefined;
  });

  await loadPromise;
};

const getTokenBucketScriptSha = async (): Promise<string> => {
  if (tokenBucketScriptSha) return tokenBucketScriptSha;

  logger.debug("Script SHA not cached — loading now");
  await loadScripts();

  if (!tokenBucketScriptSha) {
    throw new Error("Redis Lua script SHA is unavailable after load attempt");
  }

  return tokenBucketScriptSha;
};

export const runTokenBucketScript = async (
  key: string,
  capacity: number,
  refillRate: number,
  now: number
): Promise<[number, number, number]> => {
  let scriptSha = await getTokenBucketScriptSha();

  let rawResult: unknown;
  try {
    rawResult = await redis.evalsha(
      scriptSha, 1, key,
      capacity.toString(), refillRate.toString(), now.toString()
    );
  } catch (err) {
    if (!isNoScriptError(err)) throw err;

    // Redis flushed its script cache (e.g. after a restart). Reload once.
    logger.warn("Redis Lua script evicted from cache — reloading", { key, sha: scriptSha });
    tokenBucketScriptSha = undefined; // force reload
    await loadScripts();
    scriptSha = await getTokenBucketScriptSha();

    logger.debug("Retrying evalsha after reload", { sha: scriptSha });
    rawResult = await redis.evalsha(
      scriptSha, 1, key,
      capacity.toString(), refillRate.toString(), now.toString()
    );
  }

  if (!Array.isArray(rawResult) || rawResult.length < 3) {
    logger.error("Unexpected Redis script return value", { rawResult, key });
    throw new Error("Unexpected Redis script return value");
  }

  const [allowed, tokens, retryAfterMs] = rawResult.map(Number) as [number, number, number];

  logger.debug("Token bucket evaluated", {
    key,
    allowed: allowed === 1,
    tokens: +tokens.toFixed(3),
    retryAfterMs,
  });

  return [allowed, tokens, retryAfterMs];
};
