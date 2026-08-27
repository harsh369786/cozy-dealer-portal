import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AdminDataTable } from "@/components/admin/admin-data-table";
import { AdminFiltersBar } from "@/components/admin/admin-filters-bar";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminPermissionGate } from "@/components/admin/admin-permission-gate";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { useAsyncData } from "@/hooks/use-async-data";
import { useFormat } from "@/hooks/use-format";
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
  const { t } = useTranslation();
  const { formatTimestamp } = useFormat();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data, loading, error, retry } = useAsyncData(
    () => listAuditLogs({ search, page, pageSize: 10 }),
    [search, page],
  );

  if (loading) return <PageSkeleton rows={4} />;
  if (error || !data) {
    return <ErrorState message={error ?? t("errors.failedToLoadAuditLogs")} onRetry={retry} />;
  }

  return (
    <div className="min-w-0">
      <AdminPageHeader
        title={t("admin.auditLogs.title")}
        description={t("admin.auditLogs.description")}
      />

      <AdminFiltersBar
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        searchPlaceholder={t("admin.auditLogs.searchPlaceholder")}
      />

      <AdminDataTable
        data={data.items}
        keyFn={(e) => e.id}
        emptyTitle={t("admin.auditLogs.noEntries")}
        columns={[
          { key: "time", header: t("admin.auditLogs.columnTime"), cell: (e) => formatTimestamp(e.timestamp), hideOnMobile: true },
          { key: "actor", header: t("admin.auditLogs.columnActor"), cell: (e) => e.actorName },
          {
            key: "action",
            header: t("admin.auditLogs.columnAction"),
            cell: (e) => <span className="text-sm font-semibold capitalize">{e.summary}</span>,
            hideOnMobile: true,
          },
          {
            key: "entity",
            header: t("admin.auditLogs.columnEntity"),
            cell: (e) => `${e.entityType} / ${e.entityId}`,
            hideOnMobile: true,
          },
          { key: "summary", header: t("admin.auditLogs.columnSummary"), cell: (e) => <span className="break-words">{e.summary}</span> },
        ]}
      />

      <AdminPagination page={data.page} totalPages={data.totalPages} onPageChange={setPage} />
    </div>
  );
}
