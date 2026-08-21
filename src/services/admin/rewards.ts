import type { AdminRewardCatalogItem, AdminRewardClaim, ListFilters, PaginatedResult } from "@/lib/mock/admin/types";
import { api } from "@/lib/api-client";

function mapCatalog(row: Record<string, unknown>): AdminRewardCatalogItem {
  return {
    id: row.id as string,
    emoji: row.emoji as string,
    name: row.name as string,
    pointsRequired: Number(row.pointsRequired ?? row.points_required ?? 0),
    active: Boolean(row.active),
    imageUrl: (row.imageUrl ?? row.image_url) as string | undefined,
  };
}

function mapClaim(row: Record<string, unknown>): AdminRewardClaim {
  return {
    id: row.id as string,
    dealerId: row.dealerId as string,
    dealerName: row.dealerName as string,
    rewardName: row.rewardName as string,
    emoji: row.emoji as string,
    points: Number(row.points ?? row.points_spent ?? 0),
    status: row.status as AdminRewardClaim["status"],
    claimedAt: row.claimedAt as string,
    deliveredAt: (row.deliveredAt as string) ?? undefined,
  };
}

export async function listRewardCatalog(
  filters: ListFilters = {},
): Promise<PaginatedResult<AdminRewardCatalogItem>> {
  const res = await api.get<{ items: Record<string, unknown>[]; total: number; page: number; pageSize: number; totalPages: number }>(
    "/api/v1/admin/rewards",
  );
  let items = res.items.map(mapCatalog);
  if (filters.search) {
    const q = filters.search.toLowerCase();
    items = items.filter((r) => r.name.toLowerCase().includes(q));
  }
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 10;
  const start = (page - 1) * pageSize;
  const paged = items.slice(start, start + pageSize);
  return {
    items: paged,
    total: items.length,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(items.length / pageSize)),
  };
}

export async function getRewardItem(id: string): Promise<AdminRewardCatalogItem | null> {
  try {
    const row = await api.get<Record<string, unknown>>(`/api/v1/admin/rewards/${id}`);
    return mapCatalog(row);
  } catch {
    return null;
  }
}

export async function listRewardClaims(
  filters: ListFilters & { status?: "pending" | "delivered" | "all" } = {},
): Promise<PaginatedResult<AdminRewardClaim>> {
  const params = new URLSearchParams();
  if (filters.status && filters.status !== "all") params.set("status", filters.status);
  if (filters.search) params.set("search", filters.search);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.pageSize) params.set("pageSize", String(filters.pageSize));
  const q = params.toString();
  const res = await api.get<{
    items: Record<string, unknown>[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }>(`/api/v1/admin/reward-claims${q ? `?${q}` : ""}`);
  return {
    items: res.items.map(mapClaim),
    total: res.total,
    page: res.page,
    pageSize: res.pageSize,
    totalPages: res.totalPages,
  };
}

export async function saveRewardItem(item: AdminRewardCatalogItem): Promise<AdminRewardCatalogItem> {
  const body = {
    id: item.id,
    name: item.name,
    emoji: item.emoji,
    pointsRequired: item.pointsRequired,
    active: item.active,
    imageUrl: item.imageUrl ?? null,
  };
  const existing = await getRewardItem(item.id);
  const row = existing
    ? await api.patch<Record<string, unknown>>(`/api/v1/admin/rewards/${item.id}`, body)
    : await api.post<Record<string, unknown>>("/api/v1/admin/rewards", body);
  return mapCatalog(row);
}

export async function markClaimDelivered(id: string): Promise<void> {
  await api.patch(`/api/v1/admin/reward-claims/${id}`, { status: "delivered" });
}

export async function markClaimPending(id: string): Promise<void> {
  await api.patch(`/api/v1/admin/reward-claims/${id}`, { status: "pending" });
}

export async function undoRewardClaim(id: string): Promise<{ pointsReturned: number }> {
  return api.post(`/api/v1/admin/reward-claims/${id}/undo`, {});
}

export async function deleteRewardItem(id: string): Promise<void> {
  await api.delete(`/api/v1/admin/rewards/${id}`);
}
