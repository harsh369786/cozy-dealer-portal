import { adminStore } from "@/lib/mock/admin/store";
import { inrCompact } from "@/lib/demo-data";
import { dealerMomDelta, dealerSalesForMonth } from "./comparisons";
import { daysUntil, parseComplaintMonth, pctChange, previousMonth } from "./filters";
import type { AnalyticsScope } from "./scope";
import type { InsightItem } from "./types";

export function generateInsights(scope: AnalyticsScope): InsightItem[] {
  const insights: InsightItem[] = [];
  const month = scope.filters.month ?? "Aug";
  const prev = previousMonth(month);

  insights.push(...dealerInsights(scope.dealers, month, scope.filters.distributorId));
  insights.push(...distributorInsights(month));
  insights.push(...salesExecutiveInsights(scope.filters.distributorId, month));
  insights.push(...productInsights(month));
  insights.push(...campaignInsights(scope));
  insights.push(...complaintInsights(scope.complaints, month, prev));
  insights.push(...approvalInsights(scope.orders, month));

  const order: Record<InsightItem["severity"], number> = { critical: 0, warning: 1, positive: 2 };
  return insights.sort((a, b) => order[a.severity] - order[b.severity]);
}

function dealerInsights(
  dealers: AnalyticsScope["dealers"],
  month: string,
  distributorId?: string,
): InsightItem[] {
  const insights: InsightItem[] = [];
  const distAvg =
    dealers.reduce((s, d) => s + dealerSalesForMonth(d, month).sales, 0) / (dealers.length || 1);
  const sortedByTotal = [...dealers].sort((a, b) => b.totalSales - a.totalSales);
  const top40Threshold = sortedByTotal[Math.floor(sortedByTotal.length * 0.4)]?.totalSales ?? 0;

  for (const d of dealers) {
    const mom = dealerMomDelta(d, month);
    const perf = d.monthlyPerformance ?? [];
    const last3 = perf.slice(-3);
    const slope =
      last3.length >= 2
        ? last3[last3.length - 1]!.orderValue - last3[0]!.orderValue
        : 0;
    const ordersInMonth = dealerSalesForMonth(d, month).orders;
    const prevOrders = prevMonthOrders(d, month);

    if (slope < 0 && mom.changePct <= -12) {
      const avgMonthlyDecline = last3.length >= 2
        ? Math.round(
            ((last3[last3.length - 1]!.orderValue - last3[0]!.orderValue) /
              last3[0]!.orderValue) *
              100 /
              (last3.length - 1),
          )
        : mom.changePct;
      insights.push({
        id: `dealer-decline-${d.id}`,
        severity: "critical",
        entityType: "dealer",
        entityId: d.id,
        title: `${d.name} — Needs Attention`,
        body: `Sales declined ${Math.abs(mom.changePct)}% MoM (${inrCompact(d.prevMonthSales)} → ${inrCompact(d.monthSales)}) and trend averaged ${avgMonthlyDecline}%/month over the last 3 months.`,
        drillDown: { dealerId: d.id, distributorId: d.distributorId },
      });
    }

    if (ordersInMonth === 0 || isStaleOrder(d.lastOrderDate)) {
      insights.push({
        id: `dealer-no-orders-${d.id}`,
        severity: "critical",
        entityType: "dealer",
        entityId: d.id,
        title: `${d.name} — Low Activity`,
        body:
          ordersInMonth === 0
            ? `No orders in ${month}; last order on ${d.lastOrderDate}.`
            : `Only ${ordersInMonth} order(s) in ${month} (down from ${prevOrders}); last order ${d.lastOrderDate}.`,
        drillDown: { dealerId: d.id, distributorId: d.distributorId },
      });
    }

    if (d.totalSales >= top40Threshold && d.monthSales < distAvg && d.salesGrowth < 0) {
      insights.push({
        id: `dealer-potential-${d.id}`,
        severity: "warning",
        entityType: "dealer",
        entityId: d.id,
        title: `${d.name} — Underperforming vs Potential`,
        body: `Lifetime sales ${inrCompact(d.totalSales)} but ${month} sales ${inrCompact(d.monthSales)} vs territory avg ${inrCompact(Math.round(distAvg))}.`,
        drillDown: { dealerId: d.id, distributorId: d.distributorId },
      });
    }

    if (d.salesGrowth >= 10) {
      insights.push({
        id: `dealer-growth-${d.id}`,
        severity: "positive",
        entityType: "dealer",
        entityId: d.id,
        title: `${d.name} — Fast Growing`,
        body: `Up ${d.salesGrowth}% MoM (${inrCompact(d.prevMonthSales)} → ${inrCompact(d.monthSales)}).`,
        drillDown: { dealerId: d.id, distributorId: d.distributorId },
      });
    }
  }

  return insights;
}

function prevMonthOrders(
  dealer: { monthlyPerformance?: Array<{ month: string; orders: number }> },
  month: string,
): number {
  const prev = { Mar: null, Apr: "Mar", May: "Apr", Jun: "May", Jul: "Jun", Aug: "Jul" }[month];
  if (!prev) return 0;
  return dealer.monthlyPerformance?.find((p) => p.month === prev)?.orders ?? 0;
}

function isStaleOrder(lastOrderDate: string): boolean {
  const day = parseInt(lastOrderDate, 10);
  return day <= 14;
}

function distributorInsights(month: string): InsightItem[] {
  const rows = Object.entries(adminStore.distributors).map(([id]) => {
    const distDealers = adminStore.dealers.filter((d) => d.distributorId === id);
    const sales = distDealers.reduce((s, d) => s + dealerSalesForMonth(d, month).sales, 0);
    const growth =
      distDealers.reduce((s, d) => s + d.salesGrowth, 0) / (distDealers.length || 1);
    return { id, name: adminStore.distributors[id]?.name ?? id, sales, growth };
  });
  rows.sort((a, b) => a.growth - b.growth);
  const insights: InsightItem[] = [];

  const weak = rows.slice(0, 1);
  const strong = rows.slice(-1);
  for (const w of weak) {
    insights.push({
      id: `dist-weak-${w.id}`,
      severity: "critical",
      entityType: "distributor",
      entityId: w.id,
      title: `${w.name} — Weak Performance`,
      body: `Lowest avg dealer growth at ${Math.round(w.growth)}% with ${inrCompact(w.sales)} sales in ${month}.`,
      drillDown: { distributorId: w.id },
    });
  }
  for (const s of strong) {
    insights.push({
      id: `dist-top-${s.id}`,
      severity: "positive",
      entityType: "distributor",
      entityId: s.id,
      title: `${s.name} — Top Performer`,
      body: `Leading network with ${inrCompact(s.sales)} in ${month} and ${Math.round(s.growth)}% avg dealer growth.`,
      drillDown: { distributorId: s.id },
    });
  }
  return insights;
}

function salesExecutiveInsights(distributorId: string | undefined, month: string): InsightItem[] {
  const insights: InsightItem[] = [];
  const ses = adminStore.users.filter(
    (u) => u.role === "sales_executive" && (!distributorId || u.distributorId === distributorId),
  );

  for (const se of ses) {
    const assigned = adminStore.dealers.filter((d) => d.salesExecutiveId === se.id);
    const declining = assigned.filter((d) => d.salesGrowth < 0).length;
    const sales = assigned.reduce((s, d) => s + dealerSalesForMonth(d, month).sales, 0);
    const avgGrowth = assigned.reduce((s, d) => s + d.salesGrowth, 0) / (assigned.length || 1);

    if (assigned.length > 0 && declining / assigned.length >= 0.5) {
      insights.push({
        id: `se-decline-${se.id}`,
        severity: "warning",
        entityType: "sales_executive",
        entityId: se.id,
        title: `${se.name} — Declining Dealer Activity`,
        body: `${declining} of ${assigned.length} dealers declined in ${month}.`,
        drillDown: { salesExecutiveId: se.id, distributorId: se.distributorId },
      });
    }

    if (avgGrowth >= 8 && sales > 0) {
      insights.push({
        id: `se-top-${se.id}`,
        severity: "positive",
        entityType: "sales_executive",
        entityId: se.id,
        title: `${se.name} — High Performer`,
        body: `${inrCompact(sales)} in ${month} with ${Math.round(avgGrowth)}% avg dealer growth across ${assigned.length} dealers.`,
        drillDown: { salesExecutiveId: se.id, distributorId: se.distributorId },
      });
    }
  }
  return insights;
}

function productInsights(month: string): InsightItem[] {
  const insights: InsightItem[] = [];
  const prev = previousMonth(month);
  if (!prev) return insights;

  const products = [...new Set(adminStore.productMonthlyTrends.map((t) => t.product))];
  for (const product of products) {
    const cur = adminStore.productMonthlyTrends.find((t) => t.product === product && t.month === month);
    const previous = adminStore.productMonthlyTrends.find((t) => t.product === product && t.month === prev);
    if (!cur || !previous) continue;
    const unitChange = pctChange(cur.units, previous.units);

    if (unitChange >= 20) {
      insights.push({
        id: `product-surge-${product}`,
        severity: "positive",
        entityType: "product",
        entityId: product,
        title: `${product} — Rapid Growth`,
        body: `Units up ${unitChange}% (${previous.units} → ${cur.units}) in ${month}.`,
        drillDown: { product },
      });
    } else if (unitChange <= -15) {
      insights.push({
        id: `product-decline-${product}`,
        severity: "warning",
        entityType: "product",
        entityId: product,
        title: `${product} — Declining Demand`,
        body: `Units down ${Math.abs(unitChange)}% (${previous.units} → ${cur.units}) in ${month}.`,
        drillDown: { product },
      });
    }
  }
  return insights;
}

function campaignInsights(scope: AnalyticsScope): InsightItem[] {
  return scope.campaigns
    .filter((c) => c.target && c.active)
    .filter((c) => {
      const done = c.done ?? 0;
      const target = c.target ?? 1;
      const daysLeft = daysUntil(c.endDate);
      return done / target < 0.5 && daysLeft <= 45;
    })
    .map((c) => ({
      id: `campaign-risk-${c.id}`,
      severity: "warning" as const,
      entityType: "campaign" as const,
      entityId: c.id,
      title: `${c.name} — At Risk`,
      body: `${c.done ?? 0}/${c.target} (${Math.round(((c.done ?? 0) / (c.target ?? 1)) * 100)}%) with ${daysUntil(c.endDate)} days left.`,
    }));
}

function complaintInsights(
  complaints: AnalyticsScope["complaints"],
  month: string,
  prev?: string,
): InsightItem[] {
  if (!prev) return [];
  const cur = complaints.filter((c) => parseComplaintMonth(c.createdAt) === month).length;
  const previous = complaints.filter((c) => parseComplaintMonth(c.createdAt) === prev).length;
  if (cur <= previous) return [];
  const change = pctChange(cur, previous);
  return [
    {
      id: "network-complaints",
      severity: change >= 50 ? "critical" : "warning",
      entityType: "network",
      entityId: "complaints",
      title: "Rising Complaints",
      body: `Complaints rose from ${previous} to ${cur} in ${month} (+${change}%).`,
    },
  ];
}

function approvalInsights(orders: AnalyticsScope["orders"], month: string): InsightItem[] {
  const monthOrders = orders.filter((o) => o.placedAt.includes(month));
  const decided = monthOrders.filter(
    (o) =>
      o.status === "approved" ||
      o.status === "rejected" ||
      o.status === "delivered" ||
      o.status === "in_making" ||
      o.status === "out_for_delivery",
  );
  const rejected = monthOrders.filter((o) => o.status === "rejected").length;
  const approved = decided.length - rejected;
  if (decided.length < 3) return [];
  const rate = Math.round((rejected / decided.length) * 100);
  if (rate < 15) return [];
  return [
    {
      id: `approval-rate-${month}`,
      severity: rate >= 25 ? "critical" : "warning",
      entityType: "network",
      entityId: "approvals",
      title: `High Rejection Rate in ${month}`,
      body: `${rate}% rejection rate (${rejected} of ${decided.length} decided orders).`,
    },
  ];
}
