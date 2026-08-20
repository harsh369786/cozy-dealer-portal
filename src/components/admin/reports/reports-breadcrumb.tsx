import { ChevronRight } from "lucide-react";
import type { AdminAnalyticsReport, AnalyticsFilters } from "@/lib/admin/analytics";
import { cn } from "@/lib/utils";

type Props = {
  report: AdminAnalyticsReport;
  onNavigate: (filters: AnalyticsFilters) => void;
};

export function ReportsBreadcrumb({ report, onNavigate }: Props) {
  const crumbs = report.breadcrumb;
  if (crumbs.length <= 1) return null;

  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm" aria-label="Report drill-down">
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <span key={`${crumb.label}-${i}`} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            <button
              type="button"
              disabled={isLast}
              onClick={() => onNavigate(crumb.filters)}
              className={cn(
                "rounded-lg px-1 font-semibold transition-colors",
                isLast ? "text-foreground" : "text-primary hover:underline",
              )}
            >
              {crumb.label}
            </button>
          </span>
        );
      })}
    </nav>
  );
}
