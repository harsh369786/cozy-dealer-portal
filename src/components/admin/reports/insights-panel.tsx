import type { AdminAnalyticsReport, AnalyticsFilters } from "@/lib/admin/analytics";
import { AdminSection } from "@/components/admin/admin-section";
import { cn } from "@/lib/utils";

type Props = {
  report: AdminAnalyticsReport;
  onDrillDown: (filters: AnalyticsFilters) => void;
};

const SEVERITY_LABELS = {
  critical: "Needs attention",
  warning: "Watch",
  positive: "Wins",
} as const;

export function InsightsPanel({ report, onDrillDown }: Props) {
  if (report.insights.length === 0) return null;

  const groups = (["critical", "warning", "positive"] as const).map((severity) => ({
    severity,
    items: report.insights.filter((i) => i.severity === severity),
  }));

  return (
    <AdminSection title="Insights & Recommendations" description="Auto-detected from current metrics">
      <div className="space-y-4">
        {groups.map(
          (group) =>
            group.items.length > 0 && (
              <div key={group.severity}>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  {SEVERITY_LABELS[group.severity]}
                </p>
                <div className="grid gap-2 md:grid-cols-2">
                  {group.items.map((insight) => (
                    <button
                      key={insight.id}
                      type="button"
                      onClick={() =>
                        insight.drillDown &&
                        onDrillDown({ ...report.filters, ...insight.drillDown })
                      }
                      className={cn(
                        "min-w-0 rounded-2xl border p-3 text-left transition-colors hover:bg-secondary/50",
                        group.severity === "critical" && "border-rose-200 bg-rose-50/50",
                        group.severity === "warning" && "border-amber-200 bg-amber-50/50",
                        group.severity === "positive" && "border-emerald-200 bg-emerald-50/50",
                        !insight.drillDown && "cursor-default",
                      )}
                    >
                      <p className="break-words font-bold leading-snug">{insight.title}</p>
                      <p className="mt-1 break-words text-sm text-muted-foreground">{insight.body}</p>
                    </button>
                  ))}
                </div>
              </div>
            ),
        )}
      </div>
    </AdminSection>
  );
}
