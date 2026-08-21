import type { AdminComplaint, ListFilters, PaginatedResult } from "@/lib/mock/admin/types";
import type { ComplaintStatus } from "@/lib/mock/distributor/types";
import { api } from "@/lib/api-client";
import { matchesQuery, paginate } from "./_utils";

export type ComplaintFilters = ListFilters & {
  status?: ComplaintStatus | "all";
};

type ComplaintRow = {
  id: string;
  orderId?: string;
  order_id?: string;
  dealerId?: string;
  dealer_id?: string;
  dealerName?: string;
  dealer_name?: string;
  distributorName?: string;
  distributor_name?: string;
  category: string;
  description: string;
  status: ComplaintStatus;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
  history?: Array<{ label: string; at: string; note?: string }>;
};

function mapComplaint(row: ComplaintRow): AdminComplaint {
  return {
    id: row.id,
    orderId: row.orderId ?? row.order_id ?? "",
    dealerId: row.dealerId ?? row.dealer_id ?? "",
    dealerName: row.dealerName ?? row.dealer_name ?? "—",
    distributorName: row.distributorName ?? row.distributor_name ?? "—",
    category: row.category,
    description: row.description,
    status: row.status,
    createdAt: row.createdAt ?? row.created_at ?? "",
    updatedAt: row.updatedAt ?? row.updated_at ?? "",
    history: row.history ?? [],
  };
}

export async function listComplaints(filters: ComplaintFilters = {}): Promise<PaginatedResult<AdminComplaint>> {
  const rows = await api.get<ComplaintRow[]>("/api/v1/complaints");
  let items = rows.map(mapComplaint);
  if (filters.status && filters.status !== "all") {
    items = items.filter((c) => c.status === filters.status);
  }
  if (filters.search) {
    items = items.filter((c) =>
      matchesQuery(filters.search, c.id, c.orderId, c.dealerName, c.category, c.description),
    );
  }
  return paginate(items, filters);
}

export async function getComplaint(id: string): Promise<AdminComplaint | null> {
  try {
    return mapComplaint(await api.get<ComplaintRow>(`/api/v1/complaints/${id}`));
  } catch {
    return null;
  }
}

export async function updateComplaintStatus(
  id: string,
  status: ComplaintStatus,
  _resolutionNotes?: string,
): Promise<void> {
  await api.patch(`/api/v1/complaints/${id}`, { status });
}
