import type { AdminDashboardData, AdminComplaint } from "@/lib/mock/admin/types";
import { api, ApiError } from "@/lib/api-client";
import { listSignupApplications } from "./users";

type AnalyticsPayload = {
  kpis: Array<{ id: string; value: number }>;
  filterOptions?: {
    distributors?: unknown[];
    dealers?: unknown[];
  };
};

type OrderListItem = {
  id: string;
  dealerName: string;
  dealerCode: string;
  distributorName?: string;
  status: string;
  placedAt: string;
  totalValue: number;
  totalItems: number;
};

async function apiGetOptional<T>(path: string): Promise<T | null> {
  try {
    return await api.get<T>(path);
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) return null;
    throw err;
  }
}

export async function getAdminDashboard(): Promise<AdminDashboardData> {
  const [
    analytics,
    monthlySales,
    dashboardMtd,
    topProducts,
    ordersRes,
    pendingSignups,
    complaints,
    campaignsRes,
  ] = await Promise.all([
    apiGetOptional<AnalyticsPayload>("/api/v1/admin/analytics"),
    apiGetOptional<Array<{ month: string; sales: number; orders: number }>>("/api/v1/reports/monthly-sales"),
    apiGetOptional<{
      monthlySales: number;
      salesGrowth: number;
      currentMonthLabel?: string;
      previousMonthLabel?: string;
    }>("/api/v1/reports/dashboard"),
    apiGetOptional<Array<{ product: string; sales: number; units: number }>>("/api/v1/reports/product-sales"),
    api.get<{ items: OrderListItem[]; total: number }>("/api/v1/orders?page=1&pageSize=5"),
    listSignupApplications({ page: 1, pageSize: 5, status: "pending" }),
    api.get<Array<Record<string, unknown>>>("/api/v1/complaints"),
    api.get<{ total: number }>("/api/v1/admin/campaigns?status=active&pageSize=1"),
  ]);

  const kpi = (id: string) => analytics?.kpis.find((k) => k.id === id)?.value ?? 0;
  const openComplaintRows = complaints.filter(
    (c) => c.status === "pending" || c.status === "in_progress",
  );

  return {
    stats: {
      monthlySales: dashboardMtd?.monthlySales ?? 0,
      salesGrowth: dashboardMtd?.salesGrowth ?? 0,
      currentMonthLabel: dashboardMtd?.currentMonthLabel,
      previousMonthLabel: dashboardMtd?.previousMonthLabel,
      totalOrders: analytics ? kpi("orders") : ordersRes.total ?? 0,
      totalDealers: analytics?.filterOptions?.dealers?.length ?? 0,
      totalDistributors: analytics?.filterOptions?.distributors?.length ?? 0,
      pendingApprovals: analytics ? kpi("pending_approvals") : 0,
      openComplaints: analytics ? kpi("complaints") : openComplaintRows.length,
      activeCampaigns: campaignsRes.total ?? 0,
    },
    monthlySales: (monthlySales ?? []).map((row) => ({
      month: row.month,
      sales: Number(row.sales ?? 0),
      orders: Number(row.orders ?? 0),
    })),
    topProducts: (topProducts ?? []).map((row) => ({
      product: row.product,
      sales: Number(row.sales ?? 0),
      units: Number(row.units ?? 0),
    })),
    recentOrders: (ordersRes.items ?? []).map((o) => ({
      id: o.id,
      dealerName: o.dealerName,
      dealerCode: o.dealerCode,
      distributorName: o.distributorName ?? "—",
      status: o.status as AdminDashboardData["recentOrders"][number]["status"],
      placedAt: o.placedAt,
      totalValue: o.totalValue,
      totalItems: o.totalItems,
    })),
    pendingSignups: pendingSignups.items,
    openComplaints: openComplaintRows.map(mapComplaintRow),
  };
}

function mapComplaintRow(row: Record<string, unknown>): AdminComplaint {
  return {
    id: row.id as string,
    orderId: (row.orderId as string) ?? (row.order_id as string) ?? "",
    dealerId: (row.dealerId as string) ?? (row.dealer_id as string) ?? "",
    dealerName: (row.dealerName as string) ?? (row.dealer_name as string) ?? "—",
    distributorName: (row.distributorName as string) ?? "—",
    category: (row.category as string) ?? "General",
    description: (row.description as string) ?? "",
    status: row.status as AdminComplaint["status"],
    createdAt: (row.createdAt as string) ?? (row.created_at as string) ?? "",
    updatedAt: (row.updatedAt as string) ?? (row.updated_at as string) ?? "",
    history: [],
  };
}
