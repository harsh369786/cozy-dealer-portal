import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminPermissionGate } from "@/components/admin/admin-permission-gate";
import { ReportsFilterBar } from "@/components/admin/reports/reports-filter-bar";
import { ReportsChartsSimple, ReportsKpiGrid } from "@/components/admin/reports/reports-simple";
import { Button } from "@/components/ui/button";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { useAsyncData } from "@/hooks/use-async-data";
import type { AnalyticsFilters } from "@/lib/admin/analytics";
import { getAdminAnalytics } from "@/services/admin/reports";

export const Route = createFileRoute("/admin/reports/")({
  validateSearch: (s: Record<string, unknown>): AnalyticsFilters => ({
    month: (s.month as string) || undefined,
    distributorId: (s.distributorId as string) || undefined,
  }),
  component: AdminReportsPage,
});

function AdminReportsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();

  const { data, loading, error, retry } = useAsyncData(
    () => getAdminAnalytics(search),
    [search.month, search.distributorId],
  );

  const applyFilters = (filters: AnalyticsFilters) => {
    navigate({
      to: "/admin/reports",
      search: {
        month: filters.month,
        distributorId: filters.distributorId,
      },
    });
  };

  if (loading) return <PageSkeleton rows={6} />;
  if (error || !data) {
    return <ErrorState message={error ?? "Failed to load reports"} onRetry={retry} />;
  }

  return (
    <AdminPermissionGate permission="reports:read">
      <div className="space-y-6">
        <AdminPageHeader
          title="Business Reports"
          description={`${data.scopeLabel} · ${data.filters.month ?? "Aug"} 2026 — sales, orders, and dealer performance`}
        />

        <ReportsFilterBar report={data} onChange={applyFilters} />

        {data.isEmpty ? (
          <div className="rounded-3xl border border-dashed border-border bg-card p-10 text-center">
            <p className="font-display text-lg font-bold">No data for this month</p>
            <p className="mt-2 text-sm text-muted-foreground">Try another month or clear the distributor filter.</p>
            <Button className="mt-4 rounded-2xl font-bold" onClick={() => applyFilters({ month: data.filters.month })}>
              Show all distributors
            </Button>
          </div>
        ) : (
          <>
            <ReportsKpiGrid report={data} />
            <ReportsChartsSimple report={data} />
          </>
        )}
      </div>
    </AdminPermissionGate>
  );
}
