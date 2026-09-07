import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { DistributorShell } from "@/components/distributor-shell";
import { DealerPerformanceTable } from "@/components/shared/dealer-performance-table";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ChartTooltip, ChartTooltipContent, ChartContainer } from "@/components/ui/chart";
import { useAsyncData } from "@/hooks/use-async-data";
import { useFormat } from "@/hooks/use-format";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { useSession } from "@/hooks/use-session";
import { getDealerPerformance, getMonthlySales } from "@/services/reports";
import { getVisitSummary } from "@/services/visits";

export const Route = createFileRoute("/distributor/reports")({
  component: ReportsPage,
});

const lineConfig = { sales: { label: "Sales", color: "hsl(var(--primary))" } };

// Dealer sales-trend classification thresholds (percent change vs previous period).
const STRONG_SALES_CHANGE_PCT = 5;
const WEAK_SALES_CHANGE_PCT = -5;

function ReportsPage() {
  const { t } = useTranslation();
  const { formatCurrency, formatNumber } = useFormat();
  const navigate = useNavigate();
  const { role } = useSession();
  const reducedMotion = useReducedMotion();
  const [dealerFilter, setDealerFilter] = useState("all");
  const [period, setPeriod] = useState<"week" | "month" | "quarter" | "year">("month");
  const simulateError =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("error") === "1";

  const periodLabels = useMemo(
    (): Record<"week" | "month" | "quarter" | "year", string> => ({
      week: t("common.thisWeek"),
      month: t("common.thisMonth"),
      quarter: t("common.thisQuarter"),
      year: t("common.thisYear"),
    }),
    [t],
  );

  const salesQuery = useAsyncData(() => getMonthlySales(simulateError), [simulateError]);
  const dealerQuery = useAsyncData(
    () =>
      getDealerPerformance(simulateError, {
        period,
        dealerId: dealerFilter !== "all" ? dealerFilter : undefined,
      }),
    [simulateError, period, dealerFilter],
  );
  const visitQuery = useAsyncData(
    () =>
      role === "sales_executive" || role === "distributor" ? getVisitSummary() : Promise.resolve(null),
    [role],
  );

  const sales = salesQuery.data ?? [];
  const dealerData = dealerQuery.data;
  const allDealers = dealerData?.dealers ?? [];
  const filteredDealers = useMemo(
    () =>
      dealerFilter === "all"
        ? allDealers
        : allDealers.filter((d) => d.id === dealerFilter),
    [allDealers, dealerFilter],
  );
  const { strongCount, weakCount, periodTotalSales } = useMemo(() => {
    let strong = 0;
    let weak = 0;
    let total = 0;
    for (const d of filteredDealers) {
      if (d.salesChangePct >= STRONG_SALES_CHANGE_PCT) strong += 1;
      if (
        d.salesChangePct <= WEAK_SALES_CHANGE_PCT ||
        (d.currentSales === 0 && d.previousSales > 0)
      ) {
        weak += 1;
      }
      total += d.currentSales;
    }
    return { strongCount: strong, weakCount: weak, periodTotalSales: total };
  }, [filteredDealers]);

  const loading =
    salesQuery.loading ||
    dealerQuery.loading ||
    (visitQuery.loading && !visitQuery.data && (role === "sales_executive" || role === "distributor"));
  const error = salesQuery.error || dealerQuery.error;

  if (loading) {
    return (
      <DistributorShell title={t("distributor.reports.title")}>
        <PageSkeleton rows={4} />
      </DistributorShell>
    );
  }

  if (error) {
    return (
      <DistributorShell title={t("distributor.reports.title")}>
        <ErrorState
          message={error}
          onRetry={() => {
            salesQuery.retry();
            dealerQuery.retry();
            visitQuery.retry();
          }}
        />
      </DistributorShell>
    );
  }

  return (
    <DistributorShell title={t("distributor.reports.title")}>
      <p className="mb-4 text-sm text-muted-foreground">
        {t("distributor.reports.dealerPerformance")} — {t("distributor.dashboard.salesTrendDesc")}
      </p>

      {dealerData && (
        <section className="mb-6 space-y-3">
          <div className="rounded-3xl border border-border bg-card p-4 shadow-soft">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("distributor.reports.periodTotalSales")} · {periodLabels[period]}
              {dealerFilter !== "all" ? ` · ${t("common.dealer")}` : ""}
            </p>
            <p className="mt-1 font-display text-2xl font-bold">{formatCurrency(periodTotalSales)}</p>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold">{t("distributor.reports.dealerPerformance")}</h2>
              <p className="text-sm text-muted-foreground">
                {dealerData.currentMonth} vs {dealerData.previousMonth}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="rounded-2xl bg-success/15 px-3 py-1.5 font-bold text-success-foreground">
                {strongCount} {t("distributor.reports.strongDealers").toLowerCase()}
              </span>
              {weakCount > 0 ? (
                <span className="rounded-2xl border border-destructive/30 px-3 py-1.5 font-bold text-destructive">
                  {weakCount} {t("distributor.reports.weakDealers").toLowerCase()}
                </span>
              ) : (
                <span className="rounded-2xl border border-border px-3 py-1.5 font-bold text-muted-foreground">
                  {t("distributor.reports.weakDealers")}: 0
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {(["week", "month", "quarter", "year"] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPeriod(id)}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-bold ${
                    period === id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"
                  }`}
                >
                  {periodLabels[id]}
                </button>
              ))}
            </div>
            <SearchableSelect
              className="w-[200px]"
              value={dealerFilter}
              onValueChange={setDealerFilter}
              searchPlaceholder={t("common.search")}
              options={[
                { value: "all", label: t("common.all") },
                ...allDealers.map((d) => ({ value: d.id, label: d.name })),
              ]}
            />
          </div>
          <DealerPerformanceTable
            rows={filteredDealers}
            currentMonth={dealerData.currentMonth}
            previousMonth={dealerData.previousMonth}
            onDealerClick={(dealerId) =>
              navigate({ to: "/distributor/dealers/$dealerId", params: { dealerId } })
            }
          />
        </section>
      )}

      {(role === "sales_executive" || role === "distributor") && visitQuery.data && visitQuery.data.total > 0 && (
        <section className="mb-6 rounded-3xl border border-border bg-card p-4 shadow-soft">
          <h3 className="font-display font-bold">{t("distributor.reports.visitSummary")}</h3>
          <p className="mb-3 text-sm text-muted-foreground">
            {role === "distributor" ? t("distributor.reports.teamVisits") : t("distributor.reports.visitsThisMonth")}
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl bg-secondary/60 px-3 py-2 text-center">
              <p className="text-xs font-semibold text-muted-foreground">{t("common.all")}</p>
              <p className="font-display text-xl font-bold">{visitQuery.data.total}</p>
            </div>
            <div className="rounded-2xl bg-secondary/60 px-3 py-2 text-center">
              <p className="text-xs font-semibold text-muted-foreground">{t("distributor.reports.storesVisited")}</p>
              <p className="font-display text-xl font-bold">{visitQuery.data.uniqueStores}</p>
            </div>
            <div className="rounded-2xl bg-secondary/60 px-3 py-2 text-center">
              <p className="text-xs font-semibold text-muted-foreground">{t("visitStatus.completed")}</p>
              <p className="font-display text-xl font-bold">{visitQuery.data.completed}</p>
            </div>
            <div className="rounded-2xl bg-secondary/60 px-3 py-2 text-center">
              <p className="text-xs font-semibold text-muted-foreground">{t("distributor.reports.activeVisits")}</p>
              <p className="font-display text-xl font-bold">{visitQuery.data.active}</p>
            </div>
          </div>
          {role === "distributor" && visitQuery.data.bySalesExecutive.length > 0 && (
            <div className="mt-4 border-t border-border pt-4">
              <p className="mb-2 text-sm font-bold">{t("distributor.reports.visitsBySe")}</p>
              <ul className="space-y-2">
                {visitQuery.data.bySalesExecutive.map((row) => (
                  <li key={row.id} className="flex justify-between rounded-2xl bg-secondary/40 px-3 py-2 text-sm">
                    <span className="font-bold">{row.name}</span>
                    <span>{row.completed}/{row.visits}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {visitQuery.data.byStore.length > 0 && (
            <div className="mt-4 border-t border-border pt-4">
              <p className="mb-2 text-sm font-bold">{t("distributor.reports.visitsPerStore")}</p>
              <ul className="space-y-2">
                {visitQuery.data.byStore.slice(0, 10).map((row) => (
                  <li key={row.dealerId ?? row.storeName} className="rounded-2xl bg-secondary/40 px-3 py-2 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-bold">{row.storeName}</p>
                      <p className="shrink-0 font-bold">{row.visits}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t("distributor.reports.avgTimeSpent")}: {row.avgDurationMinutes != null ? `${row.avgDurationMinutes} min` : "—"} · {t("distributor.reports.lastVisit")}: {row.lastVisitAt}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {visitQuery.data.monthlyTrend.length > 0 && (
            <ul className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-4 sm:grid-cols-3">
              {visitQuery.data.monthlyTrend.map((row) => (
                <li key={row.month} className="rounded-2xl bg-secondary/40 px-3 py-2 text-sm">
                  <p className="text-xs font-semibold text-muted-foreground">{row.month}</p>
                  <p className="font-bold">
                    {row.completed}/{row.total}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="rounded-3xl border border-border bg-card p-4 shadow-soft">
        <div className="mb-3">
          <h3 className="font-display font-bold">{t("distributor.reports.salesTrendChart")}</h3>
          <p className="text-sm text-muted-foreground">{t("distributor.dashboard.salesTrendDesc")}</p>
        </div>
        {sales.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("common.monthlyTotalsPlaceholder")}
          </p>
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
                <ChartTooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.[0]) return null;
                    const row = payload[0].payload as { month: string; sales: number; orders: number };
                    return (
                      <div className="rounded-xl border bg-card p-2 text-xs shadow-soft">
                        <p className="font-bold">{row.month}</p>
                        <p>{formatCurrency(row.sales)}</p>
                        <p className="text-muted-foreground">
                          {formatNumber(row.orders)} {t("common.orders")}
                        </p>
                      </div>
                    );
                  }}
                />
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
                  <p className="font-bold leading-tight">{formatCurrency(row.sales)}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatNumber(row.orders)} {t("common.orders")}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </DistributorShell>
  );
}
