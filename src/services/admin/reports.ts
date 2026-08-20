import {
  buildAdminAnalytics,
  normalizeFilters,
  type AdminAnalyticsReport,
  type AnalyticsFilters,
} from "@/lib/admin/analytics";
import { delay } from "./_utils";

export type { AdminAnalyticsReport, AnalyticsFilters };

export async function getAdminAnalytics(
  filters: AnalyticsFilters = {},
): Promise<AdminAnalyticsReport> {
  await delay();
  return buildAdminAnalytics(normalizeFilters(filters));
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
