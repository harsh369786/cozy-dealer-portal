import { adminStore } from "@/lib/mock/admin/store";
import type { AdminComplaint, ListFilters, PaginatedResult } from "@/lib/mock/admin/types";
import type { ComplaintStatus } from "@/lib/mock/distributor/types";
import { delay, matchesQuery, paginate } from "./_utils";

export type ComplaintFilters = ListFilters & {
  status?: ComplaintStatus | "all";
};

export async function listComplaints(filters: ComplaintFilters = {}): Promise<PaginatedResult<AdminComplaint>> {
  await delay();
  let items = [...adminStore.complaints];
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
  await delay();
  return adminStore.complaints.find((c) => c.id === id) ?? null;
}

export async function updateComplaintStatus(
  id: string,
  status: ComplaintStatus,
  resolutionNotes?: string,
): Promise<void> {
  await delay();
  const complaint = adminStore.complaints.find((c) => c.id === id);
  if (!complaint) throw new Error("Complaint not found");
  complaint.status = status;
  if (resolutionNotes) complaint.resolutionNotes = resolutionNotes;
  const now = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  complaint.updatedAt = now;
  complaint.history.push({
    label: `Status → ${status.replace("_", " ")}`,
    at: now,
    note: resolutionNotes,
  });
}
