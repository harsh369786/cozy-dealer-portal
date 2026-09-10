import { api } from "@/lib/api-client";
import type { DistributorOrder } from "@/lib/mock/distributor/types";

/**
 * Client calls for the 360° admin Dealer Profile. These REUSE existing endpoints (no new reporting
 * or data systems): the dealer DTO, per-dealer orders, per-dealer rewards, and dealer-scoped visits.
 * The profile header/KPIs come from the existing dealer DTO (see getDealerById in src/services/dealers.ts)
 * and the sales chart from getDealerPerformance.
 */

/** A single reward-ledger row for the dealer, with the order reference when it was an order credit. */
export type DealerRewardLedgerRow = {
  label: string;
  delta: number;
  earned: number;
  redeemed: number;
  balanceAfter: number;
  referenceType: string | null;
  referenceId: string | null;
  /** Set when this row was an "order delivered" credit — links to /admin/orders/$orderId. */
  orderId: string | null;
  date: string;
  occurredAt: string;
};

export type DealerRewardClaimRow = {
  id: string;
  name: string;
  emoji: string;
  points: number;
  status: string;
  kind: string;
  claimedAt: string;
  approvedAt: string | null;
  deliveredAt: string | null;
};

export type DealerRewardsView = {
  summary: {
    totalEarned: number;
    totalRedeemed: number;
    available: number;
    pointsPending: number;
    claimsClaimed: number;
    claimsDelivered: number;
    claimsPending: number;
  };
  ledger: DealerRewardLedgerRow[];
  claims: DealerRewardClaimRow[];
};

/** All orders for a dealer (reuses GET /api/v1/dealers/:id/orders — unpaginated up to 500). */
export async function getDealerOrders(dealerId: string): Promise<DistributorOrder[]> {
  return api.get<DistributorOrder[]>(`/api/v1/dealers/${dealerId}/orders`);
}

/** Full per-dealer rewards view: summary + ledger (with order refs) + claim history. */
export async function getDealerRewards(dealerId: string): Promise<DealerRewardsView> {
  return api.get<DealerRewardsView>(`/api/v1/dealers/${dealerId}/rewards`);
}

/** A single item in the unified activity timeline. */
export type DealerActivityItem = {
  kind: "order" | "points_earned" | "points_redeemed" | "reward_claim" | "visit";
  at: string;
  date: string;
  title: string;
  detail?: string;
  orderId?: string | null;
  visitId?: string | null;
};

/** Merged chronological activity (orders + points + claims + visits), newest first. */
export async function getDealerActivity(dealerId: string): Promise<{ items: DealerActivityItem[] }> {
  return api.get<{ items: DealerActivityItem[] }>(`/api/v1/dealers/${dealerId}/activity`);
}
