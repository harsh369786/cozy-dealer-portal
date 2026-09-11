import { api } from "@/lib/api-client";

export type DealerBalanceSummary = {
  dealerId: string;
  dealerName: string;
  dealerCode: string;
  balance: number;
};

export type ManualCreditResult = {
  transactionId: string;
  dealerId: string;
  dealerName: string;
  pointsAdded: number;
  previousBalance: number;
  newBalance: number;
  reason: string;
  creditedAt: string;
};

export type RewardResetStatus = {
  rewardYear: number;
  alreadyResetThisYear: boolean;
  lastReset?: {
    referenceId: string;
    resetAt: string;
    dealersAffected: number;
    pointsCleared: number;
  };
};

export type RewardResetResult = {
  referenceId: string;
  rewardYear: number;
  dealersAffected: number;
  pointsCleared: number;
  resetAt: string;
};

/** Current authoritative balance for one dealer (for the credit preview). */
export function getDealerBalance(dealerId: string): Promise<DealerBalanceSummary> {
  return api.get<DealerBalanceSummary>(`/api/v1/admin/reward-points/dealers/${dealerId}`);
}

export function creditDealerPoints(input: {
  dealerId: string;
  points: number;
  reason: string;
}): Promise<ManualCreditResult> {
  return api.post<ManualCreditResult>("/api/v1/admin/reward-points/credit", input);
}

export function getRewardResetStatus(): Promise<RewardResetStatus> {
  return api.get<RewardResetStatus>("/api/v1/admin/reward-points/reset-status");
}

export function resetAllDealerRewards(code: string): Promise<RewardResetResult> {
  return api.post<RewardResetResult>("/api/v1/admin/reward-points/reset", { code });
}
