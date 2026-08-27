import { api } from "@/lib/api-client";
import type { DealerVisit } from "@/services/visits";

export async function listAdminVisits(params: {
  salesExecutiveId?: string;
  status?: "active" | "completed" | "all";
  fromDate?: string;
  toDate?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  const qs = new URLSearchParams();
  if (params.salesExecutiveId) qs.set("salesExecutiveId", params.salesExecutiveId);
  if (params.status) qs.set("status", params.status);
  if (params.fromDate) qs.set("fromDate", params.fromDate);
  if (params.toDate) qs.set("toDate", params.toDate);
  if (params.search) qs.set("search", params.search);
  if (params.page) qs.set("page", String(params.page));
  if (params.pageSize) qs.set("pageSize", String(params.pageSize));
  const q = qs.toString();
  return api.get<{
    items: DealerVisit[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }>(`/api/v1/admin/visits${q ? `?${q}` : ""}`);
}

export async function getAdminVisit(id: string) {
  return api.get<DealerVisit>(`/api/v1/admin/visits/${id}`);
}

export async function getAdminVisitFilterOptions() {
  return api.get<{ salesExecutives: Array<{ id: string; name: string }> }>(
    "/api/v1/admin/visits/filter-options",
  );
}

export async function getAdminVisitSummary(params: { fromDate?: string; toDate?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.fromDate) qs.set("fromDate", params.fromDate);
  if (params.toDate) qs.set("toDate", params.toDate);
  const q = qs.toString();
  return api.get<{
    total: number;
    completed: number;
    active: number;
    bySalesExecutive: Array<{ id: string; name: string; visits: number; completed: number }>;
    monthlyTrend: Array<{ month: string; total: number; completed: number }>;
  }>(`/api/v1/admin/visits/summary${q ? `?${q}` : ""}`);
}
