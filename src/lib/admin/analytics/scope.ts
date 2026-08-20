import { adminStore } from "@/lib/mock/admin/store";
import type { AdminCampaign, AdminComplaint } from "@/lib/mock/admin/types";
import type { DistributorDealer, DistributorOrder } from "@/lib/mock/distributor/types";
import { normalizeFilters } from "./filters";
import type { AnalyticsFilters, ReportScopeLevel } from "./types";

export type AnalyticsScope = {
  filters: AnalyticsFilters;
  scopeLevel: ReportScopeLevel;
  scopeLabel: string;
  dealers: DistributorDealer[];
  orders: DistributorOrder[];
  complaints: AdminComplaint[];
  campaigns: AdminCampaign[];
};

export function resolveScope(raw: AnalyticsFilters): AnalyticsScope {
  const filters = normalizeFilters(raw);
  let dealers = [...adminStore.dealers];

  if (filters.distributorId) {
    dealers = dealers.filter((d) => d.distributorId === filters.distributorId);
  }
  if (filters.salesExecutiveId) {
    dealers = dealers.filter((d) => d.salesExecutiveId === filters.salesExecutiveId);
  }
  if (filters.dealerId) {
    dealers = dealers.filter((d) => d.id === filters.dealerId);
  }

  const dealerIds = new Set(dealers.map((d) => d.id));

  let orders = adminStore.orders.filter((o) => dealerIds.has(o.dealerId));
  if (filters.distributorId) {
    orders = orders.filter((o) => o.distributorId === filters.distributorId);
  }

  let complaints = adminStore.complaints.filter((c) => dealerIds.has(c.dealerId));
  let campaigns = adminStore.campaigns.filter(
    (c) => !c.distributorId || !filters.distributorId || c.distributorId === filters.distributorId,
  );

  if (filters.product) {
    orders = orders.filter((o) => o.items.some((i) => i.model === filters.product));
  }

  if (filters.category) {
    const namesInCategory = new Set(
      adminStore.products
        .filter((p) => p.category === filters.category)
        .map((p) => p.name),
    );
    orders = orders.filter((o) => o.items.some((i) => namesInCategory.has(i.model)));
  }

  const scopeLevel = resolveScopeLevel(filters);
  const scopeLabel = buildScopeLabel(filters, dealers);

  return { filters, scopeLevel, scopeLabel, dealers, orders, complaints, campaigns };
}

function resolveScopeLevel(filters: AnalyticsFilters): ReportScopeLevel {
  if (filters.dealerId) return filters.product ? "product" : "dealer";
  if (filters.salesExecutiveId) return "sales_executive";
  if (filters.distributorId) return "distributor";
  if (filters.product) return "product";
  return "overall";
}

function buildScopeLabel(filters: AnalyticsFilters, dealers: DistributorDealer[]): string {
  if (filters.dealerId) {
    const d = adminStore.dealers.find((x) => x.id === filters.dealerId);
    return d?.name ?? "Dealer";
  }
  if (filters.salesExecutiveId) {
    const se = adminStore.users.find((u) => u.id === filters.salesExecutiveId);
    return se?.name ?? "Sales Executive";
  }
  if (filters.distributorId) {
    const dist = adminStore.distributors[filters.distributorId];
    return dist?.name ?? "Distributor";
  }
  if (filters.product) return filters.product;
  if (dealers.length === 0) return "No data";
  return "Network overview";
}

export function buildBreadcrumb(filters: AnalyticsFilters) {
  const crumbs: Array<{ label: string; filters: AnalyticsFilters }> = [
    { label: "Reports", filters: { month: filters.month } },
  ];

  if (filters.distributorId) {
    const dist = adminStore.distributors[filters.distributorId];
    crumbs.push({
      label: dist?.name ?? "Distributor",
      filters: { month: filters.month, distributorId: filters.distributorId },
    });
  }

  if (filters.salesExecutiveId) {
    const se = adminStore.users.find((u) => u.id === filters.salesExecutiveId);
    crumbs.push({
      label: se?.name ?? "Sales Executive",
      filters: {
        month: filters.month,
        distributorId: filters.distributorId,
        salesExecutiveId: filters.salesExecutiveId,
      },
    });
  }

  if (filters.dealerId) {
    const dealer = adminStore.dealers.find((d) => d.id === filters.dealerId);
    crumbs.push({
      label: dealer?.name ?? "Dealer",
      filters: {
        month: filters.month,
        distributorId: filters.distributorId,
        salesExecutiveId: filters.salesExecutiveId,
        dealerId: filters.dealerId,
      },
    });
  }

  if (filters.product) {
    crumbs.push({
      label: filters.product,
      filters: { ...filters },
    });
  }

  return crumbs;
}

export function buildFilterOptions(filters: AnalyticsFilters) {
  const distributors = Object.entries(adminStore.distributors).map(([id, d]) => ({
    id,
    name: d.name,
  }));

  const salesExecutives = adminStore.users
    .filter((u) => u.role === "sales_executive")
    .filter((u) => !filters.distributorId || u.distributorId === filters.distributorId)
    .map((u) => ({
      id: u.id,
      name: u.name,
      distributorId: u.distributorId ?? "",
    }));

  const dealerList = adminStore.dealers
    .filter((d) => !filters.distributorId || d.distributorId === filters.distributorId)
    .filter((d) => !filters.salesExecutiveId || d.salesExecutiveId === filters.salesExecutiveId)
    .map((d) => ({
      id: d.id,
      name: d.name,
      distributorId: d.distributorId,
    }));

  const products = [...new Set(adminStore.productSales.map((p) => p.product))];
  const categories = [...new Set(adminStore.products.map((p) => p.category))];

  return {
    months: ["Mar", "Apr", "May", "Jun", "Jul", "Aug"],
    distributors,
    salesExecutives,
    dealers: dealerList,
    products,
    categories,
  };
}
