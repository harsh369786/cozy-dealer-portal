import { TrendingDown, TrendingUp } from "lucide-react";
import type { AdminAnalyticsReport } from "@/lib/admin/analytics";
import { StatCard } from "@/components/shared/stat-card";
import { cn } from "@/lib/utils";

export function ReportsKpiGrid({ report }: { report: AdminAnalyticsReport }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      {report.kpis.map((kpi) => {
        const mom = kpi.mom;
        const Icon = mom?.direction === "up" ? TrendingUp : mom?.direction === "down" ? TrendingDown : undefined;
        const subParts = [kpi.sub, kpi.yoy ? `YoY: ${kpi.yoy.changePct > 0 ? "+" : ""}${kpi.yoy.changePct}%` : null].filter(Boolean);
        return (
          <StatCard
            key={kpi.id}
            label={kpi.label}
            value={kpi.formatted}
            sub={subParts.join(" · ")}
            icon={Icon}
            className={cn(
              mom?.direction === "up" && "border-emerald-200/60",
              mom?.direction === "down" && "border-rose-200/60",
            )}
          />
        );
      })}
    </div>
  );
}
