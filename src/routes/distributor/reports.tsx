import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DistributorShell } from "@/components/distributor-shell";
import { DealerPerformanceTable } from "@/components/shared/dealer-performance-table";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  const [dealerFilter, setDealerFilter] = useState("all");
  const [period, setPeriod] = useState<"week" | "month" | "quarter" | "year">("month");
  const simulateError =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("error") === "1";

  const salesQuery = useAsyncData(() => getMonthlySales(simulateError), [simulateError]);
  const dealerQuery = useAsyncData(
    () =>
      getDealerPerformance(simulateError, {
        period,
        dealerId: dealerFilter !== "all" ? dealerFilter : undefined,
      }),
    [simulateError, period, dealerFilter],
  );

  const sales = salesQuery.data ?? [];
  const dealerData = dealerQuery.data;
  const filteredDealers = useMemo(
    () =>
      dealerFilter === "all"
        ? (dealerData?.dealers ?? [])
        : (dealerData?.dealers.filter((d) => d.id === dealerFilter) ?? []),
    [dealerData, dealerFilter],
  );
  const strongCount = filteredDealers.filter((d) => d.salesChangePct >= 5).length;
  const weakCount = filteredDealers.filter(
    (d) => d.salesChangePct <= -5 || (d.currentSales === 0 && d.previousSales > 0),
  ).length;

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
            <div className="flex flex-wrap gap-2">
              {([
                ["week", "Weekly"],
                ["month", "Monthly"],
                ["quarter", "Quarterly"],
                ["year", "Annual"],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPeriod(id)}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-bold ${
                    period === id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {dealerData.dealers.length > 1 && (
              <Select value={dealerFilter} onValueChange={setDealerFilter}>
                <SelectTrigger className="w-[200px] rounded-lg">
                  <SelectValue placeholder="Filter dealer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All dealers</SelectItem>
                  {dealerData.dealers.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <DealerPerformanceTable
            rows={filteredDealers}
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
