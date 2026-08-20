export type ReportScopeLevel =
  | "overall"
  | "distributor"
  | "sales_executive"
  | "dealer"
  | "product";

export type AnalyticsFilters = {
  month?: string;
  fromMonth?: string;
  toMonth?: string;
  distributorId?: string;
  salesExecutiveId?: string;
  dealerId?: string;
  product?: string;
  category?: string;
};

export type DeltaMetric = {
  value: number;
  previous: number;
  changePct: number;
  direction: "up" | "down" | "flat";
};

export type KpiMetric = {
  id: string;
  label: string;
  value: number;
  formatted: string;
  sub?: string;
  mom?: DeltaMetric;
  yoy?: DeltaMetric;
};

export type TrendPoint = {
  month: string;
  sales: number;
  orders: number;
};

export type RankingRow = {
  id: string;
  name: string;
  subtitle?: string;
  sales: number;
  orders: number;
  growthPct: number;
  vsAvgPct?: number;
};

export type ShareSlice = {
  id: string;
  name: string;
  value: number;
  pct: number;
};

export type ScatterPoint = {
  id: string;
  name: string;
  orders: number;
  sales: number;
  vsAvgSalesPct: number;
};

export type CampaignPerformanceRow = {
  id: string;
  name: string;
  product: string;
  done: number;
  target: number;
  pct: number;
  daysLeft: number;
};

export type MonthlyCountRow = {
  month: string;
  count: number;
};

export type ApprovalTrendRow = {
  month: string;
  approved: number;
  rejected: number;
  pending: number;
};

export type ProductTrendRow = {
  month: string;
  product: string;
  sales: number;
  units: number;
};

export type ProductPerformanceRow = {
  product: string;
  sales: number;
  units: number;
  growthPct: number;
  vsCategoryAvgPct?: number;
};

export type InsightSeverity = "critical" | "warning" | "positive";

export type InsightDrillDown = {
  distributorId?: string;
  salesExecutiveId?: string;
  dealerId?: string;
  product?: string;
};

export type InsightItem = {
  id: string;
  severity: InsightSeverity;
  entityType: "dealer" | "distributor" | "sales_executive" | "product" | "campaign" | "network";
  entityId: string;
  title: string;
  body: string;
  drillDown?: InsightDrillDown;
};

export type HierarchyLevel = "distributor" | "sales_executive" | "dealer" | "product";

export type AdminAnalyticsReport = {
  filters: AnalyticsFilters;
  scopeLevel: ReportScopeLevel;
  scopeLabel: string;
  breadcrumb: Array<{ label: string; filters: AnalyticsFilters }>;
  isEmpty: boolean;
  kpis: KpiMetric[];
  insights: InsightItem[];
  salesTrend: TrendPoint[];
  rankings: {
    level: HierarchyLevel;
    top: RankingRow[];
    bottom: RankingRow[];
  };
  distributorShare: ShareSlice[];
  dealerScatter: ScatterPoint[];
  productPerformance: ProductPerformanceRow[];
  productTrends: ProductTrendRow[];
  campaigns: CampaignPerformanceRow[];
  rewardClaimsByMonth: MonthlyCountRow[];
  rewardStats: { totalClaims: number; pendingClaims: number; pointsOutstanding: number };
  complaintTrend: MonthlyCountRow[];
  approvalTrend: ApprovalTrendRow[];
  filterOptions: {
    months: string[];
    distributors: Array<{ id: string; name: string }>;
    salesExecutives: Array<{ id: string; name: string; distributorId: string }>;
    dealers: Array<{ id: string; name: string; distributorId: string }>;
    products: string[];
    categories: string[];
  };
};
