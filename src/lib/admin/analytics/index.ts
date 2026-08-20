import { adminStore } from "@/lib/mock/admin/store";
import type { AnalyticsFilters } from "./types";
import {
  computeApprovalTrend,
  computeCampaignPerformance,
  computeComplaintTrend,
  computeDealerScatter,
  computeDistributorShare,
  computeKpis,
  computeProductPerformance,
  computeProductTrends,
  computeRankings,
  computeRewardClaimsByMonth,
  computeRewardStats,
  computeSalesTrend,
} from "./aggregate";
import { generateInsights } from "./insights";
import { buildBreadcrumb, buildFilterOptions, resolveScope } from "./scope";
import type { AdminAnalyticsReport } from "./types";

export function buildAdminAnalytics(rawFilters: AnalyticsFilters): AdminAnalyticsReport {
  const scope = resolveScope(rawFilters);
  const { filters, scopeLevel, scopeLabel, dealers } = scope;
  const month = filters.month ?? "Aug";
  const isEmpty = dealers.length === 0;

  const kpis = isEmpty ? [] : computeKpis(scope);
  const insights = isEmpty ? [] : generateInsights(scope);
  const salesTrend = isEmpty ? [] : computeSalesTrend(scope);
  const rankings = isEmpty
    ? { level: "distributor" as const, top: [], bottom: [] }
    : computeRankings(scope);
  const distributorShare =
    scopeLevel === "overall" && !isEmpty
      ? computeDistributorShare(adminStore.dealers)
      : [];
  const dealerScatter = isEmpty ? [] : computeDealerScatter(dealers, month);
  const productPerformance = isEmpty ? [] : computeProductPerformance(scope, month);
  const productTrends = isEmpty ? [] : computeProductTrends(scope);
  const campaigns = computeCampaignPerformance(scope);
  const rewardStats = computeRewardStats();
  const rewardClaimsByMonth = computeRewardClaimsByMonth();
  const complaintTrend = computeComplaintTrend(scope.complaints);
  const approvalTrend = computeApprovalTrend(scope.orders);

  return {
    filters,
    scopeLevel,
    scopeLabel,
    breadcrumb: buildBreadcrumb(filters),
    isEmpty,
    kpis,
    insights,
    salesTrend,
    rankings,
    distributorShare,
    dealerScatter,
    productPerformance,
    productTrends,
    campaigns,
    rewardClaimsByMonth,
    rewardStats,
    complaintTrend,
    approvalTrend,
    filterOptions: buildFilterOptions(filters),
  };
}

export type { AnalyticsFilters, AdminAnalyticsReport } from "./types";
export { normalizeFilters } from "./filters";
