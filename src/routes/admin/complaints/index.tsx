import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AdminDataTable } from "@/components/admin/admin-data-table";
import { AdminFilterTabs, AdminFiltersBar } from "@/components/admin/admin-filters-bar";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { StatusBadge } from "@/components/shared/status-badge";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { useAsyncData } from "@/hooks/use-async-data";
import { useFormat } from "@/hooks/use-format";
import { complaintStatusKey } from "@/lib/i18n-labels";
import type { ComplaintStatus } from "@/lib/mock/distributor/types";
import { listComplaints } from "@/services/admin/complaints";

export const Route = createFileRoute("/admin/complaints/")({
  component: AdminComplaintsPage,
});

function AdminComplaintsPage() {
  const { t } = useTranslation();
  const { formatTimestamp } = useFormat();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ComplaintStatus | "all">("all");
  const [page, setPage] = useState(1);

  const statusTabs = useMemo(
    () =>
      (["all", "pending", "in_progress", "resolved", "rejected"] as const).map((value) => ({
        value,
        label: value === "all" ? t("common.all") : t(complaintStatusKey(value)),
      })),
    [t],
  );

  const { data, loading, error, retry } = useAsyncData(
    () => listComplaints({ search, status, page, pageSize: 10 }),
    [search, status, page],
  );

  if (loading) return <PageSkeleton rows={4} />;
  if (error || !data) {
    return <ErrorState message={error ?? t("errors.somethingWentWrong")} onRetry={retry} />;
  }

  return (
    <div>
      <AdminPageHeader title={t("admin.complaints.title")} description={t("common.trackHelpRequests")} />

      <AdminFiltersBar
        search={search}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
        searchPlaceholder={t("common.searchComplaints")}
      >
        <AdminFilterTabs
          value={status}
          onChange={(v) => { setStatus(v as ComplaintStatus | "all"); setPage(1); }}
          tabs={statusTabs}
        />
      </AdminFiltersBar>

      <AdminDataTable
        data={data.items}
        keyFn={(c) => c.id}
        onRowClick={(c) => navigate({ to: "/admin/complaints/$complaintId", params: { complaintId: c.id } })}
        emptyTitle={t("common.noMatchingResults")}
        columns={[
          { key: "id", header: t("common.reference"), cell: (c) => <span className="font-bold">{c.id}</span> },
          { key: "order", header: t("admin.dashboard.columnOrder"), cell: (c) => c.orderId, hideOnMobile: true },
          { key: "dealer", header: t("admin.dashboard.columnDealer"), cell: (c) => c.dealerName },
          { key: "status", header: t("admin.dashboard.columnStatus"), cell: (c) => <StatusBadge kind="complaint" status={c.status} /> },
          { key: "updated", header: t("common.change"), cell: (c) => formatTimestamp(c.updatedAt), hideOnMobile: true },
        ]}
      />

      <AdminPagination page={data.page} totalPages={data.totalPages} onPageChange={setPage} />
    </div>
  );
}
