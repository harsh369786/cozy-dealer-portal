import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { inr } from "@/lib/demo-data";
import type { DealerPerformanceRow } from "@/lib/mock/distributor/types";
import { cn } from "@/lib/utils";

function performanceLabel(row: DealerPerformanceRow): "strong" | "weak" | "steady" {
  if (row.salesChangePct >= 5) return "strong";
  if (row.salesChangePct <= -5 || (row.currentSales === 0 && row.previousSales > 0)) return "weak";
  return "steady";
}

const LABELS = {
  strong: { text: "Strong", variant: "secondary" as const, className: "bg-success/15 text-success-foreground" },
  weak: { text: "Needs focus", variant: "outline" as const, className: "border-destructive/40 text-destructive" },
  steady: { text: "Steady", variant: "outline" as const, className: "" },
};

export function DealerPerformanceTable({
  rows,
  currentMonth,
  previousMonth,
}: {
  rows: DealerPerformanceRow[];
  currentMonth: string;
  previousMonth: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-3xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
        No dealer sales data yet for your network.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-soft">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-secondary/60 text-left">
            <tr>
              <th className="p-3 font-bold">Dealer</th>
              <th className="p-3 font-bold">{currentMonth}</th>
              <th className="p-3 font-bold">{previousMonth}</th>
              <th className="p-3 font-bold">Change</th>
              <th className="p-3 font-bold">Orders</th>
              <th className="p-3 font-bold">Rating</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const rating = performanceLabel(row);
              const badge = LABELS[rating];
              const TrendIcon =
                row.salesChangePct > 0 ? ArrowUpRight : row.salesChangePct < 0 ? ArrowDownRight : Minus;

              return (
                <tr key={row.id} className="border-t border-border">
                  <td className="p-3">
                    <p className="font-bold">{row.name}</p>
                    <p className="text-xs text-muted-foreground">{row.code}</p>
                  </td>
                  <td className="p-3 font-semibold">{inr(row.currentSales)}</td>
                  <td className="p-3 text-muted-foreground">{inr(row.previousSales)}</td>
                  <td className="p-3">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 font-bold",
                        row.salesChangePct > 0 && "text-success",
                        row.salesChangePct < 0 && "text-destructive",
                      )}
                    >
                      <TrendIcon className="h-4 w-4" />
                      {row.salesChangePct > 0 ? "+" : ""}
                      {row.salesChangePct}%
                    </span>
                  </td>
                  <td className="p-3">
                    {row.currentOrders}
                    <span className="text-muted-foreground"> / {row.previousOrders}</span>
                  </td>
                  <td className="p-3">
                    <Badge variant={badge.variant} className={cn("capitalize", badge.className)}>
                      {badge.text}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
