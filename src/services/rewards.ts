import { api } from "@/lib/api-client";

export async function getRewardCatalog(opts?: { light?: boolean }) {
  // The reward catalog stores images as inline base64 data URLs, which can make the full response
  // hundreds of KB. Callers that only need progress/threshold data (home bar, product page) pass
  // { light: true } to skip the image payload; the rewards page fetches the full catalog.
  const qs = opts?.light ? "?light=1" : "";
  return api.get<Array<{ id: string; name: string; emoji: string; points: number; imageUrl?: string }>>(
    `/api/v1/rewards/catalog${qs}`,
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

import { listRewardClaims as listRewardClaimsWorkflow } from "@/services/reward-claims";
import type { RewardClaimStatus } from "../../shared/reward-claim-status";

export type DealerRewardClaim = {
  id: string;
  name: string;
  emoji: string;
  imageUrl?: string | null;
  claimed?: string;
  status: RewardClaimStatus;
  rejectionReason?: string;
};

/** A dealer's own reward claims, with the full workflow status (pending_approval -> delivered). */
export async function getRewardClaims(): Promise<DealerRewardClaim[]> {
  const res = await listRewardClaimsWorkflow({ pageSize: 50 });
  return res.items.map((c) => ({
    id: c.id,
    name: c.rewardName,
    emoji: c.emoji,
    imageUrl: c.imageUrl,
    claimed: c.claimedAt,
    status: c.status,
    rejectionReason: c.rejectionReason,
  }));
}

export async function redeemReward(rewardId: string) {
  return api.post("/api/v1/rewards/claims", { rewardId });
}
