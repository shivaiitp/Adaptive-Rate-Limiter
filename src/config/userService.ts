import { UserTier } from "../types";

// In-memory user → tier mapping
// In production, this would come from a database/auth service

const userTierMap = new Map<string, UserTier>();

// Pre-seeded demo users
const seedDemoUsers = () => {
  userTierMap.set("demo-free", "free");
  userTierMap.set("demo-pro", "pro");
  userTierMap.set("demo-enterprise", "enterprise");
};

seedDemoUsers();

export const getUserTier = (userId: string): UserTier => {
  return userTierMap.get(userId) ?? "free";
};

export const setUserTier = (userId: string, tier: UserTier): void => {
  userTierMap.set(userId, tier);
};

export const removeUser = (userId: string): boolean => {
  return userTierMap.delete(userId);
};

export const getAllUsers = (): { userId: string; tier: UserTier }[] => {
  return Array.from(userTierMap.entries()).map(([userId, tier]) => ({ userId, tier }));
};
