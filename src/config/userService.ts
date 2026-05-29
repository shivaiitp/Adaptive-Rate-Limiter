import { UserTier } from "../types";

// In-memory user to tier mapping
// In production, this would come from a database/auth service

const userTierMap = new Map<string, UserTier>();
const apiKeyUserMap = new Map<string, string>();

// Pre-seeded demo users
const seedDemoUsers = () => {
  userTierMap.set("demo-free", "free");
  userTierMap.set("demo-pro", "pro");
  userTierMap.set("demo-enterprise", "enterprise");

  apiKeyUserMap.set("demo-free-key", "demo-free");
  apiKeyUserMap.set("demo-pro-key", "demo-pro");
  apiKeyUserMap.set("demo-enterprise-key", "demo-enterprise");
};

seedDemoUsers();

export const getUserTier = (userId: string): UserTier => {
  return userTierMap.get(userId) ?? "free";
};

export const setUserTier = (userId: string, tier: UserTier): void => {
  userTierMap.set(userId, tier);
};

export const getUserIdByApiKey = (apiKey: string): string | undefined => {
  return apiKeyUserMap.get(apiKey);
};

export const setUserApiKey = (apiKey: string, userId: string): void => {
  apiKeyUserMap.set(apiKey, userId);
};

export const removeUser = (userId: string): boolean => {
  for (const [apiKey, mappedUserId] of apiKeyUserMap.entries()) {
    if (mappedUserId === userId) {
      apiKeyUserMap.delete(apiKey);
    }
  }

  return userTierMap.delete(userId);
};

export const getAllUsers = (): { userId: string; tier: UserTier }[] => {
  return Array.from(userTierMap.entries()).map(([userId, tier]) => ({ userId, tier }));
};
