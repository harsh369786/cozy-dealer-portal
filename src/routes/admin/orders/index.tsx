import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AdminDataTable } from "@/components/admin/admin-data-table";
import { AdminFilterTabs, AdminFiltersBar } from "@/components/admin/admin-filters-bar";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { StatusBadge } from "@/components/shared/status-badge";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { useAsyncData } from "@/hooks/use-async-data";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useFormat } from "@/hooks/use-format";
import { orderStatusKey } from "@/lib/i18n-labels";
import type { OrderStatus } from "@/lib/mock/distributor/types";
import { listOrders } from "@/services/admin/orders";

export const Route = createFileRoute("/admin/orders/")({
  validateSearch: (s: Record<string, unknown>) => ({
    status: (s.status as OrderStatus | "all") || undefined,
  }),
  component: AdminOrdersPage,
});

function AdminOrdersPage() {
  const { t } = useTranslation();
  const { formatCurrency, formatTimestamp } = useFormat();
  const navigate = useNavigate();
  const { status: statusFromUrl } = Route.useSearch();
  const [searchInput, setSearchInput] = useState("");
  const search = useDebouncedValue(searchInput, 350);
  const [status, setStatus] = useState<OrderStatus | "all">(statusFromUrl ?? "all");
  const [page, setPage] = useState(1);

  const statusTabs = useMemo(
    () =>
      (
        [
          "all",
          "order_placed",
          "approved",
          "rejected",
          "in_making",
          "out_for_delivery",
          "delivered",
          "cancelled",
        ] as const
      ).map((value) => ({
        value,
        label: value === "all" ? t("common.all") : t(orderStatusKey(value)),
      })),
    [t],
  );

  useEffect(() => {
    if (statusFromUrl) setStatus(statusFromUrl);
  }, [statusFromUrl]);

  const { data, loading, error, retry } = useAsyncData(
    () => listOrders({ search, status, page, pageSize: 10 }),
    [search, status, page],
  );

  if (loading && !data) return <PageSkeleton rows={4} />;
  if (error && !data) {
    return <ErrorState message={error ?? t("errors.failedToLoadOrders")} onRetry={retry} />;
  }

  return (
    <div>
      <AdminPageHeader title={t("admin.orders.title")} description={t("admin.orders.description")} />

      <AdminFiltersBar
        search={searchInput}
        onSearchChange={(v) => {
          setSearchInput(v);
          setPage(1);
        }}
        searchPlaceholder={t("common.searchOrders")}
      >
        <AdminFilterTabs
          value={status}
          onChange={(v) => {
            setStatus(v as OrderStatus | "all");
            setPage(1);
          }}
          tabs={statusTabs}
        />
      </AdminFiltersBar>

      <AdminDataTable
        data={data?.items ?? []}
        keyFn={(o) => o.id}
        onRowClick={(o) => navigate({ to: "/admin/orders/$orderId", params: { orderId: o.id } })}
        emptyTitle={t("common.noMatchingResults")}
        columns={[
          { key: "id", header: t("admin.dashboard.columnOrder"), cell: (o) => <span className="font-bold">#{o.id}</span> },
          { key: "dealer", header: t("admin.dashboard.columnDealer"), cell: (o) => o.dealerName },
          { key: "distributor", header: t("admin.dashboard.distributors"), cell: (o) => o.distributorName, hideOnMobile: true },
          { key: "status", header: t("admin.dashboard.columnStatus"), cell: (o) => <StatusBadge kind="order" status={o.status} /> },
          { key: "placed", header: t("common.placed"), cell: (o) => formatTimestamp(o.placedAt), hideOnMobile: true },
          { key: "value", header: t("admin.dashboard.columnValue"), cell: (o) => formatCurrency(o.totalValue) },
        ]}
      />

      {data && (
        <AdminPagination page={data.page} totalPages={data.totalPages} onPageChange={setPage} />
      )}
    </div>
  );
}
