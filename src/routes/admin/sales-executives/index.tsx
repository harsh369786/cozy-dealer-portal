import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AdminDataTable } from "@/components/admin/admin-data-table";
import { AdminFiltersBar } from "@/components/admin/admin-filters-bar";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminPermissionGate } from "@/components/admin/admin-permission-gate";
import { Badge } from "@/components/ui/badge";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { useAsyncData } from "@/hooks/use-async-data";
import { useFormat } from "@/hooks/use-format";
import { listSalesExecutives, type SalesExecutiveRow } from "@/services/admin/sales-executives";

export const Route = createFileRoute("/admin/sales-executives/")({
  component: SalesExecutivesPage,
});

function SalesExecutivesPage() {
  return (
    <AdminPermissionGate permission="dealers:read">
      <SalesExecutivesContent />
    </AdminPermissionGate>
  );
}

function SalesExecutivesContent() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { formatCurrency, formatNumber } = useFormat();
  const [search, setSearch] = useState("");

  const { data, loading, error, retry } = useAsyncData(() => listSalesExecutives(), []);

  const items = useMemo(() => {
    const all = data?.items ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.phone.toLowerCase().includes(q) ||
        (r.distributorName ?? "").toLowerCase().includes(q),
    );
  }, [data, search]);

  const totals = useMemo(() => {
    const all = data?.items ?? [];
    return {
      count: all.length,
      dealers: all.reduce((s, r) => s + r.dealerCount, 0),
      visits: all.reduce((s, r) => s + r.totalVisits, 0),
      visitsThisMonth: all.reduce((s, r) => s + r.visitsThisMonth, 0),
    };
  }, [data]);

  if (loading && !data) return <PageSkeleton rows={6} />;
  if (error && !data) return <ErrorState message={error} onRetry={retry} />;

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title={t("admin.salesExecutives.title")}
        description={t("admin.salesExecutives.description")}
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label={t("admin.salesExecutives.totalSalesExecs")}
          value={formatNumber(totals.count)}
        />
        <StatCard
          label={t("admin.salesExecutives.totalDealers")}
          value={formatNumber(totals.dealers)}
        />
        <StatCard
          label={t("admin.salesExecutives.totalVisits")}
          value={formatNumber(totals.visits)}
        />
        <StatCard
          label={t("admin.salesExecutives.visitsThisMonth")}
          value={formatNumber(totals.visitsThisMonth)}
        />
      </div>

      <AdminFiltersBar search={search} onSearchChange={setSearch} />

      <AdminDataTable<SalesExecutiveRow>
        data={items}
        keyFn={(r) => r.id}
        onRowClick={(r) =>
          navigate({ to: "/admin/sales-executives/$seId", params: { seId: r.id } })
        }
        emptyTitle={t("admin.salesExecutives.empty")}
        columns={[
          {
            key: "name",
            header: t("common.name"),
            cell: (r) => <span className="font-bold">{r.name}</span>,
          },
          { key: "phone", header: t("common.mobile"), cell: (r) => r.phone, hideOnMobile: true },
          {
            key: "status",
            header: t("common.status"),
            cell: (r) => (
              <Badge
                variant={r.status === "active" ? "secondary" : "destructive"}
                className="capitalize"
              >
                {r.status.replace(/_/g, " ")}
              </Badge>
            ),
          },
          {
            key: "distributor",
            header: t("common.distributor"),
            cell: (r) => r.distributorName ?? "—",
            hideOnMobile: true,
          },
          {
            key: "dealers",
            header: t("admin.salesExecutives.dealers"),
            cell: (r) => formatNumber(r.dealerCount),
          },
          {
            key: "visits",
            header: t("admin.salesExecutives.visits"),
            cell: (r) => formatNumber(r.totalVisits),
          },
          {
            key: "visitsMonth",
            header: t("admin.salesExecutives.thisMonth"),
            cell: (r) => formatNumber(r.visitsThisMonth),
            hideOnMobile: true,
          },
          {
            key: "orders",
            header: t("admin.salesExecutives.orders"),
            cell: (r) => formatNumber(r.totalOrders),
            hideOnMobile: true,
          },
          {
            key: "sales",
            header: t("admin.salesExecutives.sales"),
            cell: (r) => <span className="font-semibold">{formatCurrency(r.salesValue)}</span>,
          },
        ]}
      />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-3 py-2.5 text-center shadow-soft">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-display text-xl font-bold">{value}</p>
    </div>
  );
}
