import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminPermissionGate } from "@/components/admin/admin-permission-gate";
import { ReportsBreadcrumb } from "@/components/admin/reports/reports-breadcrumb";
import { ReportsFilterBar } from "@/components/admin/reports/reports-filter-bar";
import { ReportsChartsSimple, ReportsKpiGrid } from "@/components/admin/reports/reports-simple";
import { InsightsPanel } from "@/components/admin/reports/insights-panel";
import { Button } from "@/components/ui/button";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { useAsyncData } from "@/hooks/use-async-data";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type { AnalyticsFilters } from "@/lib/admin/analytics";
import { DEFAULT_FROM_MONTH, DEFAULT_TO_MONTH } from "@/lib/admin/analytics/filters";
import { getAdminAnalytics } from "@/services/admin/reports";

export const Route = createFileRoute("/admin/reports/")({
  validateSearch: (s: Record<string, unknown>): AnalyticsFilters => ({
    month: (s.month as string) || undefined,
    fromMonth: (s.fromMonth as string) || undefined,
    toMonth: (s.toMonth as string) || undefined,
    distributorId: (s.distributorId as string) || undefined,
    salesExecutiveId: (s.salesExecutiveId as string) || undefined,
    dealerId: (s.dealerId as string) || undefined,
    product: (s.product as string) || undefined,
  }),
  component: AdminReportsPage,
});

function AdminReportsPage() {
  return (
    <AdminPermissionGate permission="reports:read">
      <ReportsContent />
    </AdminPermissionGate>
  );
}

function ReportsContent() {
  const { t } = useTranslation();
  const searchParams = Route.useSearch();
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState("");
  const search = useDebouncedValue(searchInput, 350);

  const effectiveFilters: AnalyticsFilters = {
    fromMonth: searchParams.fromMonth ?? DEFAULT_FROM_MONTH,
    toMonth: searchParams.toMonth ?? DEFAULT_TO_MONTH,
    month: searchParams.month ?? searchParams.toMonth ?? DEFAULT_TO_MONTH,
    distributorId: searchParams.distributorId,
    salesExecutiveId: searchParams.salesExecutiveId,
    dealerId: searchParams.dealerId,
    product: searchParams.product,
  };

  const { data, loading, error, retry } = useAsyncData(
    () => getAdminAnalytics({ ...effectiveFilters, search: search || undefined }),
    [
      effectiveFilters.month,
      effectiveFilters.fromMonth,
      effectiveFilters.toMonth,
      effectiveFilters.distributorId,
      effectiveFilters.salesExecutiveId,
      effectiveFilters.dealerId,
      effectiveFilters.product,
      search,
    ],
  );

  const applyFilters = (filters: AnalyticsFilters) => {
    navigate({
      to: "/admin/reports",
      search: {
        month: filters.month,
        fromMonth: filters.fromMonth,
        toMonth: filters.toMonth,
        distributorId: filters.distributorId,
        salesExecutiveId: filters.salesExecutiveId,
        dealerId: filters.dealerId,
        product: filters.product,
      },
    });
  };

  if (loading && !data) return <PageSkeleton rows={6} />;
  if (error && !data) {
    return <ErrorState message={error ?? t("errors.failedToLoadReports")} onRetry={retry} />;
  }

  if (!data) return null;

  return (
    <div className="min-w-0 space-y-6 overflow-x-hidden">
      <AdminPageHeader
        title={t("admin.reports.title")}
        description={t("admin.reports.description", { scope: data.scopeLabel })}
      />

        <ReportsBreadcrumb report={data} onNavigate={applyFilters} />

        <ReportsFilterBar
          report={data}
          onChange={applyFilters}
          search={searchInput}
          onSearchChange={setSearchInput}
        />

        {data.isEmpty ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
            <p className="font-display text-lg font-bold">{t("common.noMatchingResults")}</p>
            <p className="mt-2 text-sm text-muted-foreground">{t("common.tryAgain")}</p>
            <Button className="mt-4 rounded-lg font-bold" onClick={() => applyFilters({ month: data.filters.month })}>
              {t("admin.explore.ordersByDistributor")}
            </Button>
          </div>
        ) : (
          <>
            <ReportsKpiGrid report={data} />
            <ReportsChartsSimple report={data} onDrillDown={applyFilters} />
            <InsightsPanel report={data} onDrillDown={applyFilters} />
          </>
        )}
    </div>
  );
}
