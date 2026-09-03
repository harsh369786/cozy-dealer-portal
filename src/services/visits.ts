import { api } from "@/lib/api-client";

export type DealerVisit = {
  id: string;
  salesExecutiveUserId: string;
  salesExecutiveName?: string;
  dealerName: string;
  storeName: string;
  address: string;
  mobile: string;
  dealerId?: string;
  status: "active" | "completed";
  checkInAt: string;
  checkOutAt?: string;
  checkInLat?: number;
  checkInLng?: number;
  checkOutLat?: number;
  checkOutLng?: number;
  notes?: string;
  durationMinutes?: number;
};

export async function getActiveVisit(): Promise<DealerVisit | null> {
  const res = await api.get<{ visit: DealerVisit | null }>("/api/v1/visits/active");
  return res.visit;
}

export async function checkInVisit(input: {
  dealerId?: string;
  dealerName?: string;
  storeName?: string;
  address?: string;
  mobile?: string;
  lat?: number | null;
  lng?: number | null;
}) {
  return api.post<DealerVisit>("/api/v1/visits/check-in", input);
}

export async function checkOutVisit(
  visitId: string,
  input: { notes: string; lat?: number | null; lng?: number | null },
) {
  return api.post<DealerVisit>(`/api/v1/visits/${visitId}/check-out`, input);
}

export async function listVisits(params: {
  status?: "active" | "completed" | "all";
  fromDate?: string;
  toDate?: string;
  search?: string;
  salesExecutiveUserId?: string;
  dealerId?: string;
  page?: number;
  pageSize?: number;
}) {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.fromDate) qs.set("fromDate", params.fromDate);
  if (params.toDate) qs.set("toDate", params.toDate);
  if (params.search) qs.set("search", params.search);
  if (params.salesExecutiveUserId) qs.set("salesExecutiveUserId", params.salesExecutiveUserId);
  if (params.dealerId) qs.set("dealerId", params.dealerId);
  if (params.page) qs.set("page", String(params.page));
  if (params.pageSize) qs.set("pageSize", String(params.pageSize));
  const q = qs.toString();
  return api.get<{
    items: DealerVisit[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }>(`/api/v1/visits${q ? `?${q}` : ""}`);
}

export async function getVisit(id: string) {
  return api.get<DealerVisit>(`/api/v1/visits/${id}`);
}

export async function getVisitSummary(params: { fromDate?: string; toDate?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.fromDate) qs.set("fromDate", params.fromDate);
  if (params.toDate) qs.set("toDate", params.toDate);
  const q = qs.toString();
  return api.get<{
    total: number;
    completed: number;
    active: number;
    uniqueStores: number;
    bySalesExecutive: Array<{ id: string; name: string; visits: number; completed: number }>;
    byStore: Array<{
      dealerId?: string;
      storeName: string;
      visits: number;
      completed: number;
      avgDurationMinutes?: number;
      lastVisitAt: string;
    }>;
    monthlyTrend: Array<{ month: string; total: number; completed: number }>;
  }>(`/api/v1/reports/visit-summary${q ? `?${q}` : ""}`);
}
