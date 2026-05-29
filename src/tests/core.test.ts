import test from "node:test";
import assert from "node:assert/strict";
import {
  getAdaptiveConfig,
  getMatchedEndpointKey,
  getRuleForRequest,
  resetToDefaults,
  updateTierConfig,
} from "../config/configService";
import { getUserIdByApiKey } from "../config/userService";
import {
  isUserTier,
  normalizeUserId,
  parseAdaptiveConfigUpdate,
  parseTierConfigUpdate,
  ValidationError,
} from "../config/validation";

test("endpoint-specific tier rules override tier defaults", () => {
  resetToDefaults();

  assert.deepEqual(getRuleForRequest("free", "/api/login"), {
    capacity: 3,
    refillRate: 0.5,
  });
  assert.deepEqual(getRuleForRequest("free", "/api/data"), {
    capacity: 5,
    refillRate: 1,
  });
});

test("tier config updates preserve existing fields", () => {
  resetToDefaults();

  const update = parseTierConfigUpdate(
    { default: { capacity: 25, refillRate: 4 } },
    "pro"
  );
  const updated = updateTierConfig(update);

  assert.equal(updated.default.capacity, 25);
  assert.equal(updated.default.refillRate, 4);
  assert.equal(updated.adaptiveMinFactor, 0.5);
  assert.equal(updated.endpoints?.[0].endpoint, "/api/login");
});

test("invalid tier and adaptive config payloads are rejected", () => {
  resetToDefaults();

  assert.equal(isUserTier("enterprise"), true);
  assert.equal(isUserTier("unknown"), false);

  assert.throws(
    () => parseTierConfigUpdate({ default: { capacity: 0, refillRate: 1 } }, "free"),
    ValidationError
  );

  assert.throws(
    () =>
      parseAdaptiveConfigUpdate(
        { cpuThresholdLow: 90, cpuThresholdHigh: 50 },
        getAdaptiveConfig()
      ),
    ValidationError
  );
});

test("user ids are normalized before they touch rate-limit state", () => {
  assert.equal(normalizeUserId("demo-pro"), "demo-pro");
  assert.equal(normalizeUserId("team:api_1"), "team:api_1");
  assert.equal(normalizeUserId("bad id with spaces"), "anonymous");
  assert.equal(normalizeUserId(["demo-free", "ignored"]), "demo-free");
});

test("demo API keys map to stable user ids", () => {
  assert.equal(getUserIdByApiKey("demo-free-key"), "demo-free");
  assert.equal(getUserIdByApiKey("demo-pro-key"), "demo-pro");
  assert.equal(getUserIdByApiKey("missing-key"), undefined);
});

test("endpoint matching is segment-aware (not naive prefix)", () => {
  resetToDefaults();

  assert.equal(getMatchedEndpointKey("free", "/api/login"), "/api/login");
  assert.equal(getMatchedEndpointKey("free", "/api/login/refresh"), "/api/login");
  assert.equal(getMatchedEndpointKey("free", "/api/loginhistory"), "default");
});
