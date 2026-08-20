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
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data, loading, error, retry } = useAsyncData(
    () => listAuditLogs({ search, page, pageSize: 10 }),
    [search, page],
  );

  return (
    <AdminPermissionGate permission="audit:read">
      {loading ? (
        <PageSkeleton rows={4} />
      ) : error || !data ? (
        <ErrorState message={error ?? "Failed to load audit logs"} onRetry={retry} />
      ) : (
        <div>
          <AdminPageHeader
            title="Audit logs"
            description="Important admin actions and configuration changes."
          />

          <AdminFiltersBar
            search={search}
            onSearchChange={(v) => { setSearch(v); setPage(1); }}
            searchPlaceholder="Search by actor, action or entity…"
          />

          <AdminDataTable
            data={data.items}
            keyFn={(e) => e.id}
            emptyTitle="No audit entries"
            columns={[
              { key: "time", header: "Time", cell: (e) => e.timestamp, hideOnMobile: true },
              { key: "actor", header: "Actor", cell: (e) => e.actorName },
              { key: "action", header: "Action", cell: (e) => <span className="font-mono text-xs">{e.action}</span> },
              {
                key: "entity",
                header: "Entity",
                cell: (e) => `${e.entityType} / ${e.entityId}`,
                hideOnMobile: true,
              },
              { key: "summary", header: "Summary", cell: (e) => e.summary },
            ]}
          />

          <AdminPagination page={data.page} totalPages={data.totalPages} onPageChange={setPage} />
        </div>
      )}
    </AdminPermissionGate>
  );
}
