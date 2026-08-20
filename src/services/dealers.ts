import type { DealerMonthlyPerformance, DealerRewardClaim, DistributorDealer } from "@/lib/mock/distributor/types";
import { api } from "@/lib/api-client";

export async function getDealers(simulateError = false, search?: string): Promise<DistributorDealer[]> {
  if (simulateError) throw new Error("Failed to load dealers");
  const q = search ? `?search=${encodeURIComponent(search)}` : "";
  return api.get<DistributorDealer[]>(`/api/v1/dealers${q}`);
}

export async function getDealerById(
  id: string,
  simulateError = false,
): Promise<DistributorDealer | null> {
  if (simulateError) throw new Error("Failed to load dealer");
  try {
    return await api.get<DistributorDealer>(`/api/v1/dealers/${id}`);
  } catch {
    return null;
  }
}

export async function getDealerRewardClaims(dealerId: string): Promise<DealerRewardClaim[]> {
  return api.get<DealerRewardClaim[]>(`/api/v1/dealers/${dealerId}/reward-claims`);
}

export async function getDealerPerformance(dealerId: string): Promise<DealerMonthlyPerformance[]> {
  return api.get<DealerMonthlyPerformance[]>(`/api/v1/dealers/${dealerId}/performance`);
}
