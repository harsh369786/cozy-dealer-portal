import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AdminDataTable } from "@/components/admin/admin-data-table";
import { AdminFiltersBar } from "@/components/admin/admin-filters-bar";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminPermissionGate } from "@/components/admin/admin-permission-gate";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { useAsyncData } from "@/hooks/use-async-data";
import { listAuditLogs } from "@/services/admin/audit-logs";

export const Route = createFileRoute("/admin/audit-logs/")({
  component: AuditLogsPage,
});

function AuditLogsPage() {
  return (
    <AdminPermissionGate permission="audit:read">
      <AuditLogsContent />
    </AdminPermissionGate>
  );
}

function AuditLogsContent() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data, loading, error, retry } = useAsyncData(
    () => listAuditLogs({ search, page, pageSize: 10 }),
    [search, page],
  );

  if (loading) return <PageSkeleton rows={4} />;
  if (error || !data) return <ErrorState message={error ?? "Failed to load audit logs"} onRetry={retry} />;

  return (
    <div className="min-w-0">
      <AdminPageHeader
        title="Audit logs"
        description="Important admin actions and configuration changes."
      />

      <AdminFiltersBar
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        searchPlaceholder="Search by actor, action or entity…"
      />

      <AdminDataTable
        data={data.items}
        keyFn={(e) => e.id}
        emptyTitle="No audit entries"
        columns={[
          { key: "time", header: "Time", cell: (e) => e.timestamp, hideOnMobile: true },
          { key: "actor", header: "Actor", cell: (e) => e.actorName },
          {
            key: "action",
            header: "Action",
            cell: (e) => <span className="text-sm font-semibold capitalize">{e.summary}</span>,
            hideOnMobile: true,
          },
          {
            key: "entity",
            header: "Entity",
            cell: (e) => `${e.entityType} / ${e.entityId}`,
            hideOnMobile: true,
          },
          { key: "summary", header: "Summary", cell: (e) => <span className="break-words">{e.summary}</span> },
        ]}
      />

      <AdminPagination page={data.page} totalPages={data.totalPages} onPageChange={setPage} />
    </div>
  );
}
