import { api } from "@/lib/api-client";
import type { RewardClaimStatus } from "../../shared/reward-claim-status";

export type RewardClaimListItem = {
  id: string;
  dealerId: string;
  dealerName: string;
  distributorId?: string;
  distributorName?: string;
  rewardName: string;
  emoji: string;
  points: number;
  kind: "standard" | "milestone";
  status: RewardClaimStatus;
  rejectionReason?: string;
  claimedAt?: string;
};

export type RewardClaimHistoryEntry = {
  status: RewardClaimStatus;
  at: string;
  by?: string;
  note?: string;
};

export type RewardClaimDetail = RewardClaimListItem & {
  dealerCode?: string;
  approvedAt?: string;
  processingAt?: string;
  dispatchedAt?: string;
  deliveredAt?: string;
  rejectedAt?: string;
  cancelledAt?: string;
  history: RewardClaimHistoryEntry[];
};

type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export async function listRewardClaims(
  params: { status?: RewardClaimStatus | "all"; search?: string; page?: number; pageSize?: number } = {},
): Promise<Paginated<RewardClaimListItem>> {
  const q = new URLSearchParams();
  if (params.status && params.status !== "all") q.set("status", params.status);
  if (params.search) q.set("search", params.search);
  if (params.page) q.set("page", String(params.page));
  if (params.pageSize) q.set("pageSize", String(params.pageSize));
  const qs = q.toString();
  return api.get<Paginated<RewardClaimListItem>>(`/api/v1/reward-claims${qs ? `?${qs}` : ""}`);
}

export async function getRewardClaim(id: string): Promise<RewardClaimDetail | null> {
  try {
    return await api.get<RewardClaimDetail>(`/api/v1/reward-claims/${id}`);
  } catch {
    return null;
  }
}

/** Advance a claim to a new workflow status. `reason` is required for a rejection. */
export async function transitionRewardClaim(
  id: string,
  toStatus: RewardClaimStatus,
  reason?: string,
): Promise<{ ok: true; status: RewardClaimStatus }> {
  return api.post(`/api/v1/reward-claims/${id}/transition`, { toStatus, reason });
}
