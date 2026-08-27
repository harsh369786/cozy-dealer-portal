import { formatYearMonthLabel } from "@/lib/date-format";
import type { DealerMonthlyPerformance, DealerRewardClaim, DistributorDealer } from "@/lib/mock/distributor/types";
import { api } from "@/lib/api-client";
import { isNotFoundError } from "@/lib/api-errors";

export async function getDealers(
  simulateError = false,
  opts: { search?: string; active?: "active" | "inactive"; sort?: "name" | "area" } = {},
): Promise<DistributorDealer[]> {
  if (simulateError) throw new Error("Failed to load dealers");
  const qs = new URLSearchParams();
  if (opts.search) qs.set("search", opts.search);
  if (opts.active) qs.set("active", opts.active);
  if (opts.sort) qs.set("sort", opts.sort);
  const q = qs.toString();
  return api.get<DistributorDealer[]>(`/api/v1/dealers${q ? `?${q}` : ""}`);
}

export async function getDealerById(
  id: string,
  simulateError = false,
): Promise<DistributorDealer | null> {
  if (simulateError) throw new Error("Failed to load dealer");
  try {
    return await api.get<DistributorDealer>(`/api/v1/dealers/${id}`);
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

export async function getDealerRewardClaims(dealerId: string): Promise<DealerRewardClaim[]> {
  return api.get<DealerRewardClaim[]>(`/api/v1/dealers/${dealerId}/reward-claims`);
}

export async function getDealerPerformance(dealerId: string): Promise<DealerMonthlyPerformance[]> {
  const rows = await api.get<Array<{ month: string; orders: number; orderValue: number }>>(
    `/api/v1/dealers/${dealerId}/performance`,
  );
  return rows.map((row) => ({
    month: formatYearMonthLabel(row.month) || row.month,
    orders: row.orders,
    orderValue: row.orderValue,
  }));
}
