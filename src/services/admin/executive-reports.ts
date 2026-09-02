import { api } from "@/lib/api-client";

export type ReportFilters = {
  from?: string | undefined;
  to?: string | undefined;
  distributorId?: string | undefined;
  dealerId?: string | undefined;
  dealerIds?: string | undefined;
  salesExecutiveId?: string | undefined;
  product?: string | undefined;
  category?: string | undefined;
  territory?: string | undefined;
  status?: string | undefined;
  campaignId?: string | undefined;
};

export type ReportFilterOptions = {
  months: string[];
  distributors: Array<{ id: string; name: string }>;
  dealers: Array<{ id: string; name: string }>;
  executives: Array<{ id: string; name: string }>;
  products: string[];
  categories: string[];
  statuses: string[];
  territories: string[];
};

export type MonthlyPoint = {
  ym: string;
  label: string;
  short: string;
  revenue: number;
  pcs: number;
  sqft: number;
  orders: number;
  avgPerSqft: number;
  mom: number;
};

export type TerritoryRow = {
  name: string;
  revenue: number;
  pcs: number;
  sqft: number;
  customers: number;
  share: number;
};

export type CampaignRow = {
  id: string;
  name: string;
  revenue: number;
  pcs: number;
  orders: number;
};

export type SnapshotReport = {
  kind: "snapshot" | "monthly";
  filters: ReportFilters;
  filterOptions: ReportFilterOptions;
  kpis: { revenue: number; pcs: number; sqft: number; orders: number; lines: number; avgTicket: number; yieldPerSqft: number };
  monthly: MonthlyPoint[];
  territories: TerritoryRow[];
  campaigns: CampaignRow[];
  peak: MonthlyPoint | null;
};

export type AccountRow = {
  id: string;
  name: string;
  rank: number;
  tier: "A" | "B" | "C";
  revenue: number;
  share: number;
  pcs: number;
  sqft: number;
  territory: string;
  distributorId: string;
  distributorName: string;
  salesExecutiveId: string;
  salesExecutiveName: string;
};

export type AccountsReport = {
  kind: "accounts";
  filters: ReportFilters;
  filterOptions: ReportFilterOptions;
  kpis: { revenue: number; pcs: number; sqft: number; orders: number; lines: number };
  tiers: Record<"A" | "B" | "C", { count: number; revenue: number }>;
  accounts: AccountRow[];
};

export type ProductRow = {
  id: string;
  name: string;
  category: string;
  revenue: number;
  pcs: number;
  sqft: number;
  share: number;
};

export type ProductsReport = {
  kind: "products";
  filters: ReportFilters;
  filterOptions: ReportFilterOptions;
  kpis: {
    revenue: number;
    pcs: number;
    sqft: number;
    orders: number;
    skuCount: number;
    avgProductRevenue: number;
    yieldPerSqft: number;
    avgUnitSize: number;
  };
  products: ProductRow[];
  top: ProductRow[];
};

export type DrilldownRow = {
  orderId: string;
  placedAt: string;
  status: string;
  dealerName: string;
  distributorName: string;
  salesExecutiveName: string;
  product: string;
  category: string;
  size: string;
  thickness: string;
  quantity: number;
  sqft: number;
  mrp: number;
  dealerPrice: number;
  distributorPrice: number;
  distributorMarginPercent: number;
  discountPercent: number;
  finalPrice: number;
  campaignName: string;
  pointsEarned: number;
};

export type DrilldownResult = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: DrilldownRow[];
};

function qs(filters: ReportFilters & { month?: string; page?: number; pageSize?: number }) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v != null && v !== "") params.set(k, String(v));
  }
  const q = params.toString();
  return q ? `?${q}` : "";
}

export function getReportSnapshot(filters: ReportFilters) {
  return api.get<SnapshotReport>(`/api/v1/admin/reports/snapshot${qs(filters)}`);
}

export function getReportMonthly(filters: ReportFilters) {
  return api.get<SnapshotReport>(`/api/v1/admin/reports/monthly${qs(filters)}`);
}

export function getReportAccounts(filters: ReportFilters) {
  return api.get<AccountsReport>(`/api/v1/admin/reports/accounts${qs(filters)}`);
}

export function getReportProducts(filters: ReportFilters) {
  return api.get<ProductsReport>(`/api/v1/admin/reports/products${qs(filters)}`);
}

export function getReportDrilldown(filters: ReportFilters & { month?: string; page?: number; pageSize?: number }) {
  return api.get<DrilldownResult>(`/api/v1/admin/reports/drilldown${qs(filters)}`);
}

export function inrFull(n: number) {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

export function inrLakh(n: number) {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)} L`;
  return inrFull(n);
}

export function fmtNum(n: number, digits = 0) {
  return n.toLocaleString("en-IN", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function fmtSqft(n: number) {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
}
