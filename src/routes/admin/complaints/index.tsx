import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AdminDataTable } from "@/components/admin/admin-data-table";
import { AdminFilterTabs, AdminFiltersBar } from "@/components/admin/admin-filters-bar";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { StatusBadge } from "@/components/shared/status-badge";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { useAsyncData } from "@/hooks/use-async-data";
import type { ComplaintStatus } from "@/lib/mock/distributor/types";
import { listComplaints } from "@/services/admin/complaints";

export const Route = createFileRoute("/admin/complaints/")({
  component: AdminComplaintsPage,
});

const STATUS_TABS: Array<{ value: ComplaintStatus | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In progress" },
  { value: "resolved", label: "Resolved" },
  { value: "rejected", label: "Rejected" },
];

function AdminComplaintsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ComplaintStatus | "all">("all");
  const [page, setPage] = useState(1);

  const { data, loading, error, retry } = useAsyncData(
    () => listComplaints({ search, status, page, pageSize: 10 }),
    [search, status, page],
  );

  if (loading) return <PageSkeleton rows={4} />;
  if (error || !data) return <ErrorState message={error ?? "Failed to load complaints"} onRetry={retry} />;

  return (
    <div>
      <AdminPageHeader title="Complaints" description="Help requests and resolution workflow." />

      <AdminFiltersBar search={search} onSearchChange={(v) => { setSearch(v); setPage(1); }} searchPlaceholder="Search complaints…">
        <AdminFilterTabs
          value={status}
          onChange={(v) => { setStatus(v as ComplaintStatus | "all"); setPage(1); }}
          tabs={STATUS_TABS}
        />
      </AdminFiltersBar>

      <AdminDataTable
        data={data.items}
        keyFn={(c) => c.id}
        onRowClick={(c) => navigate({ to: "/admin/complaints/$complaintId", params: { complaintId: c.id } })}
        emptyTitle="No complaints found"
        columns={[
          { key: "id", header: "ID", cell: (c) => <span className="font-bold">{c.id}</span> },
          { key: "order", header: "Order", cell: (c) => c.orderId, hideOnMobile: true },
          { key: "dealer", header: "Dealer", cell: (c) => c.dealerName },
          { key: "status", header: "Status", cell: (c) => <StatusBadge kind="complaint" status={c.status} /> },
          { key: "updated", header: "Updated", cell: (c) => c.updatedAt, hideOnMobile: true },
        ]}
      />

      <AdminPagination page={data.page} totalPages={data.totalPages} onPageChange={setPage} />
    </div>
  );
}
