import { adminStore } from "@/lib/mock/admin/store";
import type { AdminRewardCatalogItem, AdminRewardClaim, ListFilters, PaginatedResult } from "@/lib/mock/admin/types";
import { delay, matchesQuery, paginate } from "./_utils";

export async function listRewardCatalog(
  filters: ListFilters = {},
): Promise<PaginatedResult<AdminRewardCatalogItem>> {
  await delay();
  let items = [...adminStore.rewardCatalog];
  if (filters.search) {
    items = items.filter((r) => matchesQuery(filters.search, r.name));
  }
  return paginate(items, filters);
}

export async function getRewardItem(id: string): Promise<AdminRewardCatalogItem | null> {
  await delay();
  return adminStore.rewardCatalog.find((r) => r.id === id) ?? null;
}

export async function listRewardClaims(
  filters: ListFilters & { status?: "pending" | "delivered" | "all" } = {},
): Promise<PaginatedResult<AdminRewardClaim>> {
  await delay();
  let items = [...adminStore.rewardClaims];
  if (filters.status && filters.status !== "all") {
    items = items.filter((c) => c.status === filters.status);
  }
  if (filters.search) {
    items = items.filter((c) => matchesQuery(filters.search, c.dealerName, c.rewardName));
  }
  return paginate(items, filters);
}

export async function saveRewardItem(item: AdminRewardCatalogItem): Promise<AdminRewardClaim | AdminRewardCatalogItem> {
  await delay();
  const idx = adminStore.rewardCatalog.findIndex((r) => r.id === item.id);
  if (idx >= 0) {
    adminStore.rewardCatalog[idx] = item;
  } else {
    adminStore.rewardCatalog.unshift(item);
  }
  return item;
}

export async function markClaimDelivered(id: string): Promise<void> {
  await delay();
  const claim = adminStore.rewardClaims.find((c) => c.id === id);
  if (claim) {
    claim.status = "delivered";
    claim.deliveredAt = new Date().toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }
}
