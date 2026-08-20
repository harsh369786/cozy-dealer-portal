import type { PaginatedResult } from "@/lib/mock/admin/types";
import { api } from "@/lib/api-client";

export type AssignmentRow = {
  id: string;
  name: string;
  code: string;
  location: string;
  distributorId: string | null;
  distributorName: string | null;
  salesExecutiveUserId: string | null;
  salesExecutiveName: string | null;
  active: boolean;
};

export type AssignmentSummary = {
  distributors: Array<{ id: string; name: string; dealerCount: number }>;
  salesExecutives: Array<{ id: string; name: string; dealerCount: number }>;
  unassignedDistributor: number;
  unassignedSalesExecutive: number;
};

export type AssignmentOptions = {
  distributors: Array<{ id: string; name: string; region: string }>;
  salesExecutives: Array<{ id: string; name: string; phone: string }>;
};

export type AssignmentFilters = {
  search?: string;
  distributorId?: string;
  salesExecutiveUserId?: string;
  unassigned?: "distributor" | "sales_executive" | "any";
  page?: number;
  pageSize?: number;
};

function qs(filters: AssignmentFilters) {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.distributorId) params.set("distributorId", filters.distributorId);
  if (filters.salesExecutiveUserId) params.set("salesExecutiveUserId", filters.salesExecutiveUserId);
  if (filters.unassigned) params.set("unassigned", filters.unassigned);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.pageSize) params.set("pageSize", String(filters.pageSize));
  const q = params.toString();
  return q ? `?${q}` : "";
}

export async function listAssignments(
  filters: AssignmentFilters = {},
): Promise<PaginatedResult<AssignmentRow>> {
  return api.get(`/api/v1/admin/assignments${qs(filters)}`);
}

export async function getAssignmentSummary(): Promise<AssignmentSummary> {
  return api.get("/api/v1/admin/assignments/summary");
}

export async function getAssignmentOptions(): Promise<AssignmentOptions> {
  return api.get("/api/v1/admin/assignments/options");
}

export async function updateDealerAssignment(
  dealerId: string,
  patch: { distributorId?: string | null; salesExecutiveUserId?: string | null },
): Promise<AssignmentRow> {
  return api.patch(`/api/v1/admin/assignments/dealers/${dealerId}`, patch);
}

export async function bulkUpdateAssignments(input: {
  dealerIds: string[];
  distributorId?: string | null;
  salesExecutiveUserId?: string | null;
}): Promise<{ updated: number; items: AssignmentRow[] }> {
  return api.post("/api/v1/admin/assignments/bulk", input);
}
