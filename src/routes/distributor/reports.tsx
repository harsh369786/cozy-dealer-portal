import { createFileRoute } from "@tanstack/react-router";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { DistributorShell } from "@/components/distributor-shell";
import { DealerPerformanceTable } from "@/components/shared/dealer-performance-table";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { ChartTooltip, ChartTooltipContent, ChartContainer } from "@/components/ui/chart";
import { useAsyncData } from "@/hooks/use-async-data";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { inr } from "@/lib/demo-data";
import { getDealerPerformance, getMonthlySales } from "@/services/reports";

export const Route = createFileRoute("/distributor/reports")({
  component: ReportsPage,
});

const lineConfig = { sales: { label: "Sales", color: "#B45309" } };

function ReportsPage() {
  const reducedMotion = useReducedMotion();
  const simulateError =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("error") === "1";

  const salesQuery = useAsyncData(() => getMonthlySales(simulateError), [simulateError]);
  const dealerQuery = useAsyncData(() => getDealerPerformance(simulateError), [simulateError]);

  const loading = salesQuery.loading || dealerQuery.loading;
  const error = salesQuery.error || dealerQuery.error;

  if (loading) {
    return (
      <DistributorShell title="Reports">
        <PageSkeleton rows={4} />
      </DistributorShell>
    );
  }

  if (error) {
    return (
      <DistributorShell title="Reports">
        <ErrorState
          message={error}
          onRetry={() => {
            salesQuery.retry();
            dealerQuery.retry();
          }}
        />
      </DistributorShell>
    );
  }

  const sales = salesQuery.data ?? [];
  const dealerData = dealerQuery.data;
  const strongCount = dealerData?.dealers.filter((d) => d.salesChangePct >= 5).length ?? 0;
  const weakCount =
    dealerData?.dealers.filter((d) => d.salesChangePct <= -5 || (d.currentSales === 0 && d.previousSales > 0))
      .length ?? 0;

  return (
    <DistributorShell title="Dealer Reports">
      <p className="mb-4 text-sm text-muted-foreground">
        Compare each dealer month on month to spot who is growing and who needs support.
      </p>

      {dealerData && (
        <section className="mb-6 space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold">Dealer performance</h2>
              <p className="text-sm text-muted-foreground">
                {dealerData.currentMonth} vs {dealerData.previousMonth}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="rounded-2xl bg-success/15 px-3 py-1.5 font-bold text-success-foreground">
                {strongCount} strong
              </span>
              <span className="rounded-2xl border border-destructive/30 px-3 py-1.5 font-bold text-destructive">
                {weakCount} need focus
              </span>
            </div>
          </div>
          <DealerPerformanceTable
            rows={dealerData.dealers}
            currentMonth={dealerData.currentMonth}
            previousMonth={dealerData.previousMonth}
          />
        </section>
      )}

      <section className="rounded-3xl border border-border bg-card p-4 shadow-soft">
        <div className="mb-3">
          <h3 className="font-display font-bold">Network sales trend</h3>
          <p className="text-sm text-muted-foreground">Your dealers combined — last 6 months</p>
        </div>
        {sales.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No sales history yet.</p>
        ) : (
          <>
            <ChartContainer config={lineConfig} className="aspect-auto h-44 w-full md:h-48">
              <LineChart data={sales} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8DFD0" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${(v / 100000).toFixed(0)}L`}
                  width={36}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line
                  type="monotone"
                  dataKey="sales"
                  stroke="var(--color-sales)"
                  strokeWidth={2}
                  dot={{ r: 4, fill: "var(--color-sales)" }}
                  animationDuration={reducedMotion ? 0 : 800}
                />
              </LineChart>
            </ChartContainer>
            <ul className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 sm:grid-cols-3">
              {sales.map((row) => (
                <li key={row.month} className="rounded-2xl bg-secondary/60 px-3 py-2">
                  <p className="text-xs font-semibold text-muted-foreground">{row.month}</p>
                  <p className="font-bold leading-tight">{inr(row.sales)}</p>
                  <p className="text-xs text-muted-foreground">{row.orders} orders</p>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </DistributorShell>
  );
}
