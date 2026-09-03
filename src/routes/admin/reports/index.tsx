import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminPermissionGate } from "@/components/admin/admin-permission-gate";
import { ExecutiveAccountsPage } from "@/components/admin/reports/executive-accounts";
import { ExecutiveDrilldown } from "@/components/admin/reports/executive-drilldown";
import { ExecutiveFilterBar } from "@/components/admin/reports/executive-filter-bar";
import { ExecutiveMonthlyPage } from "@/components/admin/reports/executive-monthly";
import { ExecutiveProductsPage } from "@/components/admin/reports/executive-products";
import { ExecutiveSnapshotPage } from "@/components/admin/reports/executive-snapshot";
import type { DrillContext, ReportView } from "@/components/admin/reports/executive-types";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { useAsyncData } from "@/hooks/use-async-data";
import {
  getReportAccounts,
  getReportMonthly,
  getReportProducts,
  getReportSnapshot,
  type AccountsReport,
  type ProductsReport,
  type ReportFilters,
  type SnapshotReport,
} from "@/services/admin/executive-reports";
import { cn } from "@/lib/utils";

type Search = ReportFilters & { view?: ReportView };

export const Route = createFileRoute("/admin/reports/")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    view: (["snapshot", "monthly", "accounts", "products"].includes(String(s.view))
      ? (s.view as ReportView)
      : "snapshot"),
    from: (s.from as string) || undefined,
    to: (s.to as string) || undefined,
    distributorId: (s.distributorId as string) || undefined,
    dealerId: (s.dealerId as string) || undefined,
    salesExecutiveId: (s.salesExecutiveId as string) || undefined,
    product: (s.product as string) || undefined,
    category: (s.category as string) || undefined,
    territory: (s.territory as string) || undefined,
    status: (s.status as string) || undefined,
    campaignId: (s.campaignId as string) || undefined,
  }),
  component: AdminReportsPage,
});

const VIEWS: Array<{ id: ReportView; label: string }> = [
  { id: "snapshot", label: "Snapshot" },
  { id: "monthly", label: "Monthly" },
  { id: "accounts", label: "Accounts" },
  { id: "products", label: "Products" },
];

function AdminReportsPage() {
  return (
    <AdminPermissionGate permission="reports:read">
      <ReportsContent />
    </AdminPermissionGate>
  );
}

function ReportsContent() {
  const { t } = useTranslation();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [drill, setDrill] = useState<DrillContext | null>(null);
  const view = search.view ?? "snapshot";
  const filters: ReportFilters = {
    from: search.from,
    to: search.to,
    distributorId: search.distributorId,
    dealerId: search.dealerId,
    salesExecutiveId: search.salesExecutiveId,
    product: search.product,
    category: search.category,
    territory: search.territory,
    status: search.status,
    campaignId: search.campaignId,
  };

  const { data, loading, error, retry } = useAsyncData(() => {
    if (view === "monthly") return getReportMonthly(filters);
    if (view === "accounts") return getReportAccounts(filters);
    if (view === "products") return getReportProducts(filters);
    return getReportSnapshot(filters);
  }, [
    view,
    filters.from,
    filters.to,
    filters.distributorId,
    filters.dealerId,
    filters.salesExecutiveId,
    filters.product,
    filters.category,
    filters.territory,
    filters.status,
    filters.campaignId,
  ]);

  const apply = (next: Search) => {
    navigate({ to: "/admin/reports", search: { ...search, ...next } });
  };

  const options = data?.filterOptions;

  if (loading && !data) return <PageSkeleton rows={8} />;
  if (error && !data) {
    return <ErrorState message={error ?? t("errors.failedToLoadReports")} onRetry={retry} />;
  }
  if (!data || !options) return null;

  return (
    <div className="min-w-0 space-y-6 overflow-x-hidden">
      <AdminPageHeader
        title={t("admin.reports.title")}
        description="Executive sales snapshot, monthly trajectory, account tiers, and product mix."
      />

      <div className="flex flex-wrap gap-2">
        {VIEWS.map((item) => (
          <Button
            key={item.id}
            type="button"
            variant={view === item.id ? "default" : "outline"}
            className={cn("rounded-lg font-bold", view === item.id && "shadow-soft")}
            onClick={() => apply({ view: item.id })}
          >
            {item.label}
          </Button>
        ))}
      </div>

      <ExecutiveFilterBar
        filters={filters}
        options={options}
        onChange={(next) => apply(next)}
        canReset={Boolean(
          filters.distributorId ||
            filters.dealerId ||
            filters.salesExecutiveId ||
            filters.product ||
            filters.category ||
            filters.territory ||
            filters.status ||
            filters.campaignId,
        )}
        onReset={() =>
          apply({
            distributorId: undefined,
            dealerId: undefined,
            salesExecutiveId: undefined,
            product: undefined,
            category: undefined,
            territory: undefined,
            status: undefined,
            campaignId: undefined,
          })
        }
      />

      {/* Gate each view on the data shape matching the view. useAsyncData keeps stale data
          from the previous view across a tab switch, so we must not hand snapshot data to a
          products/accounts component (which would crash on data.top / data.tiers). */}
      {view === "snapshot" && (data.kind === "snapshot" || data.kind === "monthly") && (
        <ExecutiveSnapshotPage data={data as SnapshotReport} onDrill={setDrill} />
      )}
      {view === "monthly" && (data.kind === "snapshot" || data.kind === "monthly") && (
        <ExecutiveMonthlyPage
          data={data as SnapshotReport}
          onDrill={setDrill}
          onFilterPeriod={(ym) => apply({ from: ym, to: ym })}
        />
      )}
      {view === "accounts" && data.kind === "accounts" && (
        <ExecutiveAccountsPage
          data={data as AccountsReport}
          onDrill={setDrill}
          onFilterDealer={(dealerId) => apply({ view: "snapshot", dealerId })}
        />
      )}
      {view === "products" && data.kind === "products" && (
        <ExecutiveProductsPage
          data={data as ProductsReport}
          onDrill={setDrill}
          onFilterProduct={(product) => apply({ product })}
        />
      )}
      {(() => {
        const snapshotViews = view === "snapshot" || view === "monthly";
        const snapshotData = data.kind === "snapshot" || data.kind === "monthly";
        const matches = snapshotViews ? snapshotData : data.kind === view;
        // Data belongs to the previous view (stale during the tab-switch fetch) — show a
        // skeleton until the new view's data arrives instead of crashing on a mismatched shape.
        return matches ? null : <PageSkeleton rows={8} />;
      })()}

      <ExecutiveDrilldown context={drill} onClose={() => setDrill(null)} />
    </div>
  );
}
