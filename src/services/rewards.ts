import { api } from "@/lib/api-client";

export async function getRewardCatalog() {
  return api.get<Array<{ id: string; name: string; emoji: string; points: number }>>(
    "/api/v1/rewards/catalog",
  );
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
