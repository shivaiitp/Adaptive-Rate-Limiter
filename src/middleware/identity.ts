import { Request } from "express";
import { getUserIdByApiKey, getUserTier } from "../config/userService";
import { normalizeUserId } from "../config/validation";
import { AuthenticatedUser } from "../types";

const isApiKeyRequired = (): boolean => process.env.REQUIRE_API_KEY === "true";

const firstHeaderValue = (value: string | string[] | undefined): string | undefined => {
  return Array.isArray(value) ? value[0] : value;
};

export const resolveRequestUser = (req: Request): AuthenticatedUser | undefined => {
  const apiKey = firstHeaderValue(req.headers["x-api-key"]);

  if (apiKey) {
    const userId = getUserIdByApiKey(apiKey);
    if (!userId) return undefined;

    return {
      userId,
      tier: getUserTier(userId),
    };
  }

  if (isApiKeyRequired()) {
    return undefined;
  }

  const userId = normalizeUserId(req.headers["x-user-id"]);
  return {
    userId,
    tier: getUserTier(userId),
  };
};
