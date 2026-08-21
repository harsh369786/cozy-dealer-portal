import { lazy, Suspense } from "react";
import type { AdminAnalyticsReport, AnalyticsFilters } from "@/lib/admin/analytics";
import { DeferredMount } from "@/components/shared/deferred-mount";
import { PageSkeleton } from "@/components/shared/states";

const ReportsChartsOverview = lazy(() =>
  import("./reports-charts-overview").then((m) => ({ default: m.ReportsChartsOverview })),
);
const ReportsChartsBreakdown = lazy(() =>
  import("./reports-charts-breakdown").then((m) => ({ default: m.ReportsChartsBreakdown })),
);
const ReportsChartsDetails = lazy(() =>
  import("./reports-charts-details").then((m) => ({ default: m.ReportsChartsDetails })),
);

type Props = {
  report: AdminAnalyticsReport;
  onDrillDown: (filters: AnalyticsFilters) => void;
};

export function ReportsCharts({ report, onDrillDown }: Props) {
  return (
    <div className="space-y-6 print:space-y-4">
      <DeferredMount>
        <Suspense fallback={<PageSkeleton rows={4} />}>
          <ReportsChartsOverview report={report} onDrillDown={onDrillDown} />
        </Suspense>
      </DeferredMount>

      <DeferredMount>
        <Suspense fallback={<PageSkeleton rows={4} />}>
          <ReportsChartsBreakdown report={report} onDrillDown={onDrillDown} />
        </Suspense>
      </DeferredMount>

      <DeferredMount>
        <Suspense fallback={<PageSkeleton rows={4} />}>
          <ReportsChartsDetails report={report} onDrillDown={onDrillDown} />
        </Suspense>
      </DeferredMount>
    </div>
  );
}
