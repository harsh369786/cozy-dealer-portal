import { adminStore } from "@/lib/mock/admin/store";
import { inrCompact } from "@/lib/demo-data";
import type { DistributorDealer } from "@/lib/mock/distributor/types";
import {
  dealerMomDelta,
  dealerSalesForMonth,
  formatDeltaSub,
  formatKpiValue,
  makeDelta,
  yoyDelta,
} from "./comparisons";
import { monthInRange, parseComplaintMonth, parseOrderMonth, previousMonth } from "./filters";
import type { AnalyticsScope } from "./scope";
import type {
  ApprovalTrendRow,
  CampaignPerformanceRow,
  HierarchyLevel,
  KpiMetric,
  MonthlyCountRow,
  ProductPerformanceRow,
  ProductTrendRow,
  RankingRow,
  ScatterPoint,
  ShareSlice,
  TrendPoint,
} from "./types";
import { daysUntil } from "./filters";

export function computeKpis(scope: AnalyticsScope): KpiMetric[] {
  const { filters, dealers, orders, complaints } = scope;
  const month = filters.month ?? "Aug";
  const prev = previousMonth(month);

  const sales = dealers.reduce((s, d) => s + dealerSalesForMonth(d, month).sales, 0);
  const prevSales = prev
    ? dealers.reduce((s, d) => s + dealerSalesForMonth(d, prev).sales, 0)
    : dealers.reduce((s, d) => s + d.prevMonthSales, 0);

  const ordersCount = dealers.reduce((s, d) => s + dealerSalesForMonth(d, month).orders, 0);
  const prevOrders = prev
    ? dealers.reduce((s, d) => s + dealerSalesForMonth(d, prev).orders, 0)
    : Math.round(ordersCount * 0.92);

  const aov = ordersCount > 0 ? Math.round(sales / ordersCount) : 0;
  const prevAov = prevOrders > 0 ? Math.round(prevSales / prevOrders) : 0;

  const activeDealers = dealers.filter((d) => d.active).length;
  const inactiveDealers = dealers.length - activeDealers;

  const pendingApprovals = orders.filter((o) => {
    const m = parseOrderMonth(o.placedAt);
    return m === month && o.status === "order_placed";
  }).length;

  const openComplaints = complaints.filter(
    (c) => c.status === "pending" || c.status === "in_progress",
  ).length;

  const monthRow = adminStore.monthlySales.find((m) => m.month === month);
  const momSales = makeDelta(sales, prevSales);
  const momOrders = makeDelta(ordersCount, prevOrders);
  const yoy = monthRow?.priorYearSales ? yoyDelta(sales, monthRow.priorYearSales) : undefined;

  return [
    {
      id: "sales",
      label: "Total sales",
      value: sales,
      formatted: formatKpiValue("sales", sales),
      sub: formatDeltaSub(momSales),
      mom: momSales,
      yoy,
    },
    {
      id: "orders",
      label: "Orders",
      value: ordersCount,
      formatted: formatKpiValue("orders", ordersCount),
      sub: formatDeltaSub(momOrders),
      mom: momOrders,
    },
    {
      id: "aov",
      label: "Avg order value",
      value: aov,
      formatted: inrCompact(aov),
      sub: prevAov > 0 ? formatDeltaSub(makeDelta(aov, prevAov)) : undefined,
      mom: makeDelta(aov, prevAov),
    },
    {
      id: "active_dealers",
      label: "Active dealers",
      value: activeDealers,
      formatted: String(activeDealers),
      sub: `${inactiveDealers} inactive`,
    },
    {
      id: "pending_approvals",
      label: "Pending approvals",
      value: pendingApprovals,
      formatted: String(pendingApprovals),
      sub: `in ${month}`,
    },
    {
      id: "open_complaints",
      label: "Open complaints",
      value: openComplaints,
      formatted: String(openComplaints),
    },
  ];
}

export function computeSalesTrend(scope: AnalyticsScope): TrendPoint[] {
  const { filters, dealers } = scope;
  const from = filters.fromMonth ?? "Mar";
  const to = filters.toMonth ?? filters.month ?? "Aug";

  return adminStore.monthlySales
    .filter((m) => monthInRange(m.month, from, to))
    .map((m) => {
      if (scope.dealers.length === adminStore.dealers.length) {
        return { month: m.month, sales: m.sales, orders: m.orders };
      }
      const sales = dealers.reduce(
        (s, d) => s + dealerSalesForMonth(d, m.month).sales,
        0,
      );
      const orders = dealers.reduce(
        (s, d) => s + dealerSalesForMonth(d, m.month).orders,
        0,
      );
      return { month: m.month, sales, orders };
    });
}

export function computeDistributorShare(dealers: DistributorDealer[]): ShareSlice[] {
  const byDist = new Map<string, number>();
  for (const d of dealers) {
    byDist.set(d.distributorId, (byDist.get(d.distributorId) ?? 0) + d.monthSales);
  }
  const total = [...byDist.values()].reduce((s, v) => s + v, 0) || 1;
  return [...byDist.entries()].map(([id, value]) => ({
    id,
    name: adminStore.distributors[id]?.name ?? id,
    value,
    pct: Math.round((value / total) * 100),
  }));
}

export function computeDealerScatter(dealers: DistributorDealer[], month: string): ScatterPoint[] {
  const avgSales =
    dealers.reduce((s, d) => s + dealerSalesForMonth(d, month).sales, 0) / (dealers.length || 1);
  return dealers.map((d) => {
    const { sales, orders } = dealerSalesForMonth(d, month);
    const vsAvgSalesPct = avgSales > 0 ? Math.round(((sales - avgSales) / avgSales) * 100) : 0;
    return { id: d.id, name: d.name, orders, sales, vsAvgSalesPct };
  });
}

export function computeProductPerformance(
  scope: AnalyticsScope,
  month: string,
): ProductPerformanceRow[] {
  const prev = previousMonth(month);
  const products = scope.filters.product
    ? [scope.filters.product]
    : scope.filters.category
      ? [
          ...new Set(
            adminStore.products
              .filter((p) => p.category === scope.filters.category)
              .map((p) => p.name)
              .filter((name) => adminStore.productSales.some((ps) => ps.product === name)),
          ),
        ]
      : [...new Set(adminStore.productSales.map((p) => p.product))];

  return products.map((product) => {
    const aug = adminStore.productMonthlyTrends.filter(
      (t) => t.product === product && t.month === month,
    );
    const prevRow = prev
      ? adminStore.productMonthlyTrends.filter((t) => t.product === product && t.month === prev)
      : [];
    const sales = aug.reduce((s, t) => s + t.sales, 0);
    const units = aug.reduce((s, t) => s + t.units, 0);
    const prevUnits = prevRow.reduce((s, t) => s + t.units, 0);
    const growthPct = prevUnits > 0 ? Math.round(((units - prevUnits) / prevUnits) * 100) : 0;
    return { product, sales, units, growthPct };
  });
}

export function computeProductTrends(scope: AnalyticsScope): ProductTrendRow[] {
  const { filters } = scope;
  const from = filters.fromMonth ?? "Mar";
  const to = filters.toMonth ?? filters.month ?? "Aug";
  let trends = adminStore.productMonthlyTrends.filter((t) => monthInRange(t.month, from, to));
  if (filters.product) trends = trends.filter((t) => t.product === filters.product);
  return trends;
}

export function computeCampaignPerformance(scope: AnalyticsScope): CampaignPerformanceRow[] {
  return scope.campaigns
    .filter((c) => c.target && c.active)
    .map((c) => {
      const done = c.done ?? 0;
      const target = c.target ?? 1;
      return {
        id: c.id,
        name: c.name,
        product: c.product,
        done,
        target,
        pct: Math.round((done / target) * 100),
        daysLeft: daysUntil(c.endDate),
      };
    });
}

export function computeRewardStats() {
  return {
    totalClaims: adminStore.rewardClaims.length,
    pendingClaims: adminStore.rewardClaims.filter((c) => c.status === "pending").length,
    pointsOutstanding: adminStore.dealers.reduce((s, d) => s + d.rewardPoints, 0),
  };
}

export function computeRewardClaimsByMonth(): MonthlyCountRow[] {
  const counts = new Map<string, number>();
  for (const c of adminStore.rewardClaims) {
    const m = parseOrderMonth(c.claimedAt) ?? "Aug";
    counts.set(m, (counts.get(m) ?? 0) + 1);
  }
  return ["Mar", "Apr", "May", "Jun", "Jul", "Aug"].map((month) => ({
    month,
    count: counts.get(month) ?? 0,
  }));
}

export function computeComplaintTrend(complaints: AnalyticsScope["complaints"]): MonthlyCountRow[] {
  const counts = new Map<string, number>();
  for (const c of complaints) {
    const m = parseComplaintMonth(c.createdAt) ?? "Aug";
    counts.set(m, (counts.get(m) ?? 0) + 1);
  }
  return ["Mar", "Apr", "May", "Jun", "Jul", "Aug"].map((month) => ({
    month,
    count: counts.get(month) ?? 0,
  }));
}

export function computeApprovalTrend(orders: AnalyticsScope["orders"]): ApprovalTrendRow[] {
  const months = ["Mar", "Apr", "May", "Jun", "Jul", "Aug"];
  return months.map((month) => {
    const monthOrders = orders.filter((o) => parseOrderMonth(o.placedAt) === month);
    return {
      month,
      approved: monthOrders.filter((o) =>
        ["approved", "in_making", "out_for_delivery", "delivered"].includes(o.status),
      ).length,
      rejected: monthOrders.filter((o) => o.status === "rejected").length,
      pending: monthOrders.filter((o) => o.status === "order_placed").length,
    };
  });
}

export function rankingFromDealers(dealers: DistributorDealer[], month: string, avgSales?: number): RankingRow[] {
  return dealers
    .map((d) => {
      const { sales, orders } = dealerSalesForMonth(d, month);
      const mom = dealerMomDelta(d, month);
      return {
        id: d.id,
        name: d.name,
        subtitle: d.code,
        sales,
        orders,
        growthPct: mom.changePct,
        vsAvgPct: avgSales && avgSales > 0 ? Math.round(((sales - avgSales) / avgSales) * 100) : undefined,
      };
    })
    .sort((a, b) => b.sales - a.sales);
}

export function rankingFromDistributors(month: string): RankingRow[] {
  const byDist = new Map<string, { sales: number; orders: number; growth: number[] }>();
  for (const d of adminStore.dealers) {
    const entry = byDist.get(d.distributorId) ?? { sales: 0, orders: 0, growth: [] };
    const { sales, orders } = dealerSalesForMonth(d, month);
    entry.sales += sales;
    entry.orders += orders;
    entry.growth.push(d.salesGrowth);
    byDist.set(d.distributorId, entry);
  }
  return [...byDist.entries()]
    .map(([id, v]) => ({
      id,
      name: adminStore.distributors[id]?.name ?? id,
      subtitle: adminStore.distributors[id]?.region,
      sales: v.sales,
      orders: v.orders,
      growthPct: Math.round(v.growth.reduce((s, g) => s + g, 0) / (v.growth.length || 1)),
    }))
    .sort((a, b) => b.sales - a.sales);
}

export function rankingFromSalesExecutives(distributorId: string | undefined, month: string): RankingRow[] {
  const dealers = distributorId
    ? adminStore.dealers.filter((d) => d.distributorId === distributorId)
    : adminStore.dealers;
  const bySe = new Map<string, { sales: number; orders: number; growth: number[] }>();
  for (const d of dealers) {
    const entry = bySe.get(d.salesExecutiveId) ?? { sales: 0, orders: 0, growth: [] };
    const { sales, orders } = dealerSalesForMonth(d, month);
    entry.sales += sales;
    entry.orders += orders;
    entry.growth.push(d.salesGrowth);
    bySe.set(d.salesExecutiveId, entry);
  }
  return [...bySe.entries()]
    .map(([id, v]) => {
      const se = adminStore.users.find((u) => u.id === id);
      return {
        id,
        name: se?.name ?? id,
        sales: v.sales,
        orders: v.orders,
        growthPct: Math.round(v.growth.reduce((s, g) => s + g, 0) / (v.growth.length || 1)),
      };
    })
    .sort((a, b) => b.sales - a.sales);
}

export function rankingFromProducts(month: string): RankingRow[] {
  const products = computeProductPerformance(
    { filters: { month }, scopeLevel: "overall", scopeLabel: "", dealers: adminStore.dealers, orders: adminStore.orders, complaints: adminStore.complaints, campaigns: adminStore.campaigns },
    month,
  );
  return products
    .map((p) => ({
      id: p.product,
      name: p.product,
      sales: p.sales,
      orders: p.units,
      growthPct: p.growthPct,
    }))
    .sort((a, b) => b.sales - a.sales);
}

export function resolveRankingLevel(scope: AnalyticsScope): HierarchyLevel {
  if (scope.filters.dealerId) return "product";
  if (scope.filters.salesExecutiveId) return "dealer";
  if (scope.filters.distributorId) return "sales_executive";
  return "distributor";
}

export function computeRankings(scope: AnalyticsScope): {
  level: HierarchyLevel;
  top: RankingRow[];
  bottom: RankingRow[];
} {
  const month = scope.filters.month ?? "Aug";
  const level = resolveRankingLevel(scope);
  let rows: RankingRow[] = [];

  if (level === "distributor") rows = rankingFromDistributors(month);
  else if (level === "sales_executive") rows = rankingFromSalesExecutives(scope.filters.distributorId, month);
  else if (level === "dealer") {
    const avg =
      scope.dealers.reduce((s, d) => s + dealerSalesForMonth(d, month).sales, 0) /
      (scope.dealers.length || 1);
    rows = rankingFromDealers(scope.dealers, month, avg);
  } else {
    rows = rankingFromProducts(month);
  }

  return {
    level,
    top: rows.slice(0, 5),
    bottom: [...rows].reverse().slice(0, 5),
  };
}
