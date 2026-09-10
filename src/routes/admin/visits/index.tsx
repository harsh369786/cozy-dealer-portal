import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AdminDataTable } from "@/components/admin/admin-data-table";
import { AdminFilterTabs, AdminFiltersBar } from "@/components/admin/admin-filters-bar";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { StatusBadge } from "@/components/shared/status-badge";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAsyncData } from "@/hooks/use-async-data";
import { useFormat } from "@/hooks/use-format";
import { getAdminVisitSummary, getAdminVisitFilterOptions, listAdminVisits } from "@/services/admin/visits";

export const Route = createFileRoute("/admin/visits/")({
  component: AdminVisitsPage,
});

function formatDuration(minutes?: number) {
  if (minutes == null) return "—";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function AdminVisitsPage() {
  const { t } = useTranslation();
  const { formatTimestamp } = useFormat();
  const navigate = useNavigate();
  // AdminFiltersBar debounces search internally (350ms) with a focus-stable input.
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "completed">("all");
  const [salesExecutiveId, setSalesExecutiveId] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);

  const statusTabs = useMemo(
    () => [
      { value: "all", label: t("admin.visits.tabs.all") },
      { value: "active", label: t("admin.visits.tabs.active") },
      { value: "completed", label: t("admin.visits.tabs.completed") },
    ],
    [t],
  );

  const optionsQuery = useAsyncData(() => getAdminVisitFilterOptions(), []);
  const summaryQuery = useAsyncData(
    () => getAdminVisitSummary({ fromDate: fromDate || undefined, toDate: toDate || undefined }),
    [fromDate, toDate],
  );
  const listQuery = useAsyncData(
    () =>
      listAdminVisits({
        search,
        status,
        salesExecutiveId: salesExecutiveId !== "all" ? salesExecutiveId : undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        page,
        pageSize: 10,
      }),
    [search, status, salesExecutiveId, fromDate, toDate, page],
  );

  const error = listQuery.error || summaryQuery.error;
  const data = listQuery.data;
  const summary = summaryQuery.data;
  const salesExecutives = optionsQuery.data?.salesExecutives ?? [];

  // Only block the whole page on the FIRST load (no data yet). Once we have data, keep the page —
  // including the search input — mounted while filtered results refetch, so typing never unmounts
  // the input (which was causing focus loss and the "page refresh" feel).
  const initialLoading = (listQuery.loading || summaryQuery.loading) && !data && !summary;
  if (initialLoading) return <PageSkeleton rows={4} />;
  if (error && !data) {
    return (
      <ErrorState
        message={error ?? t("errors.failedToLoadVisits")}
        onRetry={() => {
          listQuery.retry();
          summaryQuery.retry();
        }}
      />
    );
  }

  return (
    <div>
      <AdminPageHeader title={t("admin.visits.title")} description={t("admin.visits.description")} />

      {summary && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label={t("admin.visits.summaryTotal")} value={summary.total} />
          <KpiCard label={t("admin.visits.tabs.completed")} value={summary.completed} />
          <KpiCard label={t("admin.visits.summaryActive")} value={summary.active} />
          <KpiCard
            label={t("common.salesExecutive")}
            value={summary.bySalesExecutive.length}
            sub={
              summary.bySalesExecutive[0]
                ? `${summary.bySalesExecutive[0].name} (${summary.bySalesExecutive[0].visits})`
                : undefined
            }
          />
        </div>
      )}

      <AdminFiltersBar
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        searchPlaceholder={t("admin.visits.searchPlaceholder")}
      >
        <AdminFilterTabs
          value={status}
          onChange={(v) => {
            setStatus(v as typeof status);
            setPage(1);
          }}
          tabs={statusTabs}
        />
        <Select
          value={salesExecutiveId}
          onValueChange={(v) => {
            setSalesExecutiveId(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[200px] rounded-xl">
            <SelectValue placeholder={t("common.salesExecutive")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("common.all")}</SelectItem>
            {salesExecutives.map((se) => (
              <SelectItem key={se.id} value={se.id}>
                {se.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs">{t("common.from")}</Label>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(1);
              }}
              className="w-[140px] rounded-xl"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(1);
              }}
              className="w-[140px] rounded-xl"
            />
          </div>
        </div>
      </AdminFiltersBar>

      <AdminDataTable
        data={data?.items ?? []}
        keyFn={(v) => v.id}
        onRowClick={(v) => navigate({ to: "/admin/visits/$visitId", params: { visitId: v.id } })}
        emptyTitle={t("common.noMatchingResults")}
        columns={[
          {
            key: "se",
            header: t("admin.visits.columnExecutive"),
            cell: (v) => v.salesExecutiveName ?? "—",
          },
          { key: "dealer", header: t("admin.visits.columnDealer"), cell: (v) => v.dealerName },
          { key: "store", header: t("common.store"), cell: (v) => v.storeName, hideOnMobile: true },
          { key: "mobile", header: t("common.mobile"), cell: (v) => v.mobile, hideOnMobile: true },
          {
            key: "checkin",
            header: t("admin.visits.columnCheckIn"),
            cell: (v) => formatTimestamp(v.checkInAt),
            hideOnMobile: true,
          },
          {
            key: "duration",
            header: t("admin.visits.columnDuration"),
            cell: (v) => formatDuration(v.durationMinutes),
          },
          {
            key: "status",
            header: t("admin.visits.columnStatus"),
            cell: (v) => <StatusBadge kind="visit" status={v.status} />,
          },
        ]}
      />

      {data && (
        <AdminPagination page={data.page} totalPages={data.totalPages} onPageChange={setPage} />
      )}
    </div>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold">{value}</p>
      {sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}
    </div>
  );
}
