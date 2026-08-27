import { ArrowLeft, ChevronRight } from "lucide-react";
import type { AdminAnalyticsReport, AnalyticsFilters } from "@/lib/admin/analytics";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  report: AdminAnalyticsReport;
  onNavigate: (filters: AnalyticsFilters) => void;
};

export function ReportsBreadcrumb({ report, onNavigate }: Props) {
  const crumbs = report.breadcrumb;
  if (crumbs.length <= 1) return null;

  const parentCrumb = crumbs.length > 2 ? crumbs[crumbs.length - 2] : crumbs[0];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="rounded-lg font-bold"
        onClick={() => onNavigate(parentCrumb.filters)}
      >
        <ArrowLeft className="mr-1 h-4 w-4" />
        Back
      </Button>
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
    </div>
  );
}
