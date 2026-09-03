import { api } from "@/lib/api-client";

export async function getRewardCatalog() {
  return api.get<Array<{ id: string; name: string; emoji: string; points: number; imageUrl?: string }>>(
    "/api/v1/rewards/catalog",
  );
}

export type AdditionalRewardItem = {
  id: string;
  name: string;
  emoji: string;
  points: number;
  imageUrl?: string;
  eligible: boolean;
  remaining: number;
  pct: number;
};

export type AdditionalRewardsPayload = {
  lifetimeEarned: number;
  claimed: { id: string; name: string; emoji: string } | null;
  items: AdditionalRewardItem[];
};

export async function getAdditionalRewards() {
  return api.get<AdditionalRewardsPayload>("/api/v1/rewards/additional");
}

export async function getRewardBalance() {
  return api.get<{ balance: number; nextRewardAt: number }>("/api/v1/rewards/balance");
}

export async function getRewardLedger() {
  return api.get<Array<{ label: string; value: number; date: string }>>("/api/v1/rewards/ledger");
}

export async function getRewardClaims() {
  return api.get<
    Array<{
      id: string;
      name: string;
      emoji: string;
      claimed: string;
      status: "Delivered" | "Pending";
      delivered?: string;
    }>
  >("/api/v1/rewards/claims");
}

export async function redeemReward(rewardId: string) {
  return api.post("/api/v1/rewards/claims", { rewardId });
}
