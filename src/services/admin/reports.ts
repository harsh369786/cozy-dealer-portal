import type { AdminAnalyticsReport, AnalyticsFilters } from "@/lib/admin/analytics";
import { api } from "@/lib/api-client";
import {
  buildAdminAnalytics,
  normalizeFilters,
  type AdminAnalyticsReport as MockReport,
} from "@/lib/admin/analytics";
import { delay } from "./_utils";

export type { AdminAnalyticsReport, AnalyticsFilters };

function qs(filters: AnalyticsFilters & { search?: string }) {
  const params = new URLSearchParams();
  if (filters.month) params.set("month", filters.month);
  if (filters.fromMonth) params.set("fromMonth", filters.fromMonth);
  if (filters.toMonth) params.set("toMonth", filters.toMonth);
  if (filters.distributorId) params.set("distributorId", filters.distributorId);
  if (filters.salesExecutiveId) params.set("salesExecutiveId", filters.salesExecutiveId);
  if (filters.dealerId) params.set("dealerId", filters.dealerId);
  if (filters.product) params.set("product", filters.product);
  if (filters.search) params.set("search", filters.search);
  const q = params.toString();
  return q ? `?${q}` : "";
}

export async function getAdminAnalytics(
  filters: AnalyticsFilters & { search?: string } = {},
): Promise<AdminAnalyticsReport> {
  try {
    return await api.get<AdminAnalyticsReport>(`/api/v1/admin/analytics${qs(filters)}`);
  } catch {
    await delay();
    return buildAdminAnalytics(normalizeFilters(filters)) as MockReport;
  }
}

export type ExploreLevel = "distributors" | "dealers" | "orders";

export type ExploreItem = Record<string, unknown>;

export async function exploreAdminData(params: {
  level?: ExploreLevel;
  distributorId?: string;
  dealerId?: string;
  search?: string;
  from?: string;
  to?: string;
}) {
  const q = new URLSearchParams();
  if (params.level) q.set("level", params.level);
  if (params.distributorId) q.set("distributorId", params.distributorId);
  if (params.dealerId) q.set("dealerId", params.dealerId);
  if (params.search) q.set("search", params.search);
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);
  const suffix = q.toString();
  return api.get<{ level: ExploreLevel; items: ExploreItem[] }>(
    `/api/v1/admin/explore${suffix ? `?${suffix}` : ""}`,
  );
}

/** @deprecated Use getAdminAnalytics */
export async function getAdminReports() {
  const report = await getAdminAnalytics({});
  return {
    monthlySales: report.salesTrend.map((t) => ({
      month: t.month,
      sales: t.sales,
      orders: t.orders,
    })),
    productSales: report.productPerformance.map((p) => ({
      product: p.product,
      sales: p.sales,
      units: p.units,
    })),
    dealerPerformance: report.rankings.top.map((d) => ({
      id: d.id,
      name: d.name,
      code: d.subtitle ?? "",
      monthSales: d.sales,
      orderCount: d.orders,
      salesGrowth: d.growthPct,
    })),
    distributorPerformance: report.distributorShare.map((d) => ({
      id: d.id,
      name: d.name,
      region: "",
      dealerCount: 0,
      monthSales: d.value,
    })),
    orderStats: {
      total: report.kpis.find((k) => k.id === "orders")?.value ?? 0,
      pending: report.kpis.find((k) => k.id === "pending_approvals")?.value ?? 0,
      approved: 0,
      delivered: 0,
    },
    rewardStats: report.rewardStats,
  };
}
