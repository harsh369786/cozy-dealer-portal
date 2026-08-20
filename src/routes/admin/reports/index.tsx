import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminPermissionGate } from "@/components/admin/admin-permission-gate";
import { InsightsPanel } from "@/components/admin/reports/insights-panel";
import { ReportsBreadcrumb } from "@/components/admin/reports/reports-breadcrumb";
import { ReportsCharts } from "@/components/admin/reports/reports-charts";
import { ReportsFilterBar } from "@/components/admin/reports/reports-filter-bar";
import { ReportsKpiGrid } from "@/components/admin/reports/reports-kpi-grid";
import { Button } from "@/components/ui/button";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { useAsyncData } from "@/hooks/use-async-data";
import type { AnalyticsFilters } from "@/lib/admin/analytics";
import { getAdminAnalytics } from "@/services/admin/reports";

export const Route = createFileRoute("/admin/reports/")({
  validateSearch: (s: Record<string, unknown>): AnalyticsFilters => ({
    month: (s.month as string) || undefined,
    distributorId: (s.distributorId as string) || undefined,
    salesExecutiveId: (s.salesExecutiveId as string) || undefined,
    dealerId: (s.dealerId as string) || undefined,
    product: (s.product as string) || undefined,
    category: (s.category as string) || undefined,
  }),
  component: AdminReportsPage,
});

function AdminReportsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();

  const { data, loading, error, retry } = useAsyncData(
    () => getAdminAnalytics(search),
    [
      search.month,
      search.distributorId,
      search.salesExecutiveId,
      search.dealerId,
      search.product,
      search.category,
    ],
  );

  const applyFilters = (filters: AnalyticsFilters) => {
    navigate({
      to: "/admin/reports",
      search: {
        month: filters.month,
        distributorId: filters.distributorId,
        salesExecutiveId: filters.salesExecutiveId,
        dealerId: filters.dealerId,
        product: filters.product,
        category: filters.category,
      },
    });
  };

  if (loading) return <PageSkeleton rows={6} />;
  if (error || !data) {
    return <ErrorState message={error ?? "Failed to load reports"} onRetry={retry} />;
  }

  return (
    <AdminPermissionGate permission="reports:read">
    <div className="space-y-6 print:space-y-4" id="admin-reports-export">
      <AdminPageHeader
        title="Reports & Analytics"
        description={`${data.scopeLabel} · ${data.filters.month ?? "Aug"} 2026`}
        actions={
          <Button variant="outline" disabled className="rounded-2xl font-bold print:hidden">
            Export PDF (coming soon)
          </Button>
        }
      />

      <ReportsBreadcrumb report={data} onNavigate={applyFilters} />
      <ReportsFilterBar report={data} onChange={applyFilters} />

      {data.isEmpty ? (
        <div className="rounded-3xl border border-dashed border-border bg-card p-10 text-center">
          <p className="font-display text-lg font-bold">No data for these filters</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Try widening your date range or clearing distributor / dealer filters.
          </p>
          <Button className="mt-4 rounded-2xl font-bold" onClick={() => applyFilters({ month: data.filters.month })}>
            Reset to overview
          </Button>
        </div>
      ) : (
        <>
          <InsightsPanel report={data} onDrillDown={applyFilters} />
          <ReportsKpiGrid report={data} />
          <ReportsCharts report={data} onDrillDown={applyFilters} />
        </>
      )}
    </div>
    </AdminPermissionGate>
  );
}
