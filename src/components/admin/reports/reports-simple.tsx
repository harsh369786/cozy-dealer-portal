import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { useNavigate } from "@tanstack/react-router";
import type { AdminAnalyticsReport } from "@/lib/admin/analytics";
import { ChartCard } from "@/components/shared/chart-card";
import { ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { inr, inrCompact } from "@/lib/demo-data";
import { AdminSection } from "@/components/admin/admin-section";
import type { AnalyticsFilters } from "@/lib/admin/analytics";
import { barConfig, createRankingClickHandler, lineConfig, RankingSection } from "./reports-charts-shared";

const KEY_KPI_IDS = ["sales", "orders", "pending_approvals", "open_complaints"] as const;

const visitBarConfig = {
  total: { label: "Total", color: "#B45309" },
  completed: { label: "Completed", color: "#059669" },
};

function chartMonthLabel(label: string) {
  return label.replace(/\s+\d{4}$/, "").slice(0, 3);
}

function truncateLabel(label: string, max = 12) {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

const chartMargin = { left: 0, right: 4, top: 8, bottom: 4 };
const mobileXAxisProps = {
  tickLine: false as const,
  axisLine: false as const,
  interval: 0 as const,
  tick: { fontSize: 10 },
  tickFormatter: (v: string) => chartMonthLabel(String(v)),
  height: 28,
};

export function ReportsKpiGrid({ report }: { report: AdminAnalyticsReport }) {
  const kpis = report.kpis.filter((k) => KEY_KPI_IDS.includes(k.id as (typeof KEY_KPI_IDS)[number]));

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {kpis.map((kpi) => (
        <div key={kpi.id} className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-soft">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{kpi.label}</p>
          <p className="mt-1 break-words font-display text-xl font-bold sm:text-2xl">{kpi.formatted}</p>
          {kpi.sub && <p className="mt-1 break-words text-sm text-muted-foreground">{kpi.sub}</p>}
        </div>
      ))}
    </div>
  );
}

export function ReportsChartsSimple({
  report,
  onDrillDown,
}: {
  report: AdminAnalyticsReport;
  onDrillDown?: (filters: AnalyticsFilters) => void;
}) {
  const reducedMotion = useReducedMotion();
  const anim = reducedMotion ? 0 : 700;
  const navigate = useNavigate();
  const onRowClick = onDrillDown ? createRankingClickHandler(report, onDrillDown) : undefined;
  const onProfileClick =
    report.rankings.level === "dealer"
      ? (row: { id: string }) =>
          navigate({
            to: "/admin/explore",
            search: {
              metric: "sales",
              distributorId: report.filters.distributorId,
              dealerId: row.id,
            },
          })
      : undefined;

  const trendData = report.salesTrend.slice(-5).map((t) => ({
    month: t.month,
    sales: t.sales,
    orders: t.orders,
  }));

  const topProducts = report.productPerformance.slice(0, 5).map((p) => ({
    product: truncateLabel(p.product, 14),
    fullProduct: p.product,
    sales: p.sales,
  }));

  const visitMetrics = report.visitMetrics;
  const visitTrend = visitMetrics?.monthlyTrend ?? [];
  const visitsBySe = visitMetrics?.bySalesExecutive.slice(0, 5) ?? [];

  return (
    <div className="min-w-0 space-y-6">
      {visitMetrics && visitMetrics.total > 0 && (
        <AdminSection title="Field visits" description="Sales executive dealer visits">
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total visits</p>
              <p className="mt-1 font-display text-2xl font-bold">{visitMetrics.total}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Completed</p>
              <p className="mt-1 font-display text-2xl font-bold">{visitMetrics.completed}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Active now</p>
              <p className="mt-1 font-display text-2xl font-bold">{visitMetrics.active}</p>
            </div>
          </div>
          {visitTrend.length > 0 && (
            <ChartCard title="Monthly visit trend" description="Check-ins over time" config={visitBarConfig}>
              <BarChart data={visitTrend} margin={chartMargin}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8DFD0" />
                <XAxis dataKey="month" {...mobileXAxisProps} />
                <YAxis tickLine={false} axisLine={false} width={24} allowDecimals={false} tick={{ fontSize: 10 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="total" fill="var(--color-total)" radius={[4, 4, 0, 0]} animationDuration={anim} />
                <Bar dataKey="completed" fill="var(--color-completed)" radius={[4, 4, 0, 0]} animationDuration={anim} />
              </BarChart>
            </ChartCard>
          )}
          {visitsBySe.length > 0 && (
            <div className="mt-4 rounded-xl border border-border bg-card p-4 shadow-soft">
              <p className="mb-3 text-sm font-bold">Visits by sales executive</p>
              <ul className="space-y-2">
                {visitsBySe.map((se) => (
                  <li key={se.id} className="flex items-center justify-between text-sm">
                    <span className="font-medium">{se.name}</span>
                    <span className="text-muted-foreground">
                      {se.completed}/{se.visits} completed
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </AdminSection>
      )}

      <div>
        <ChartCard title="Sales trend" description="Monthly sales in the selected period" config={lineConfig}>
          <LineChart data={trendData} margin={chartMargin}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8DFD0" />
            <XAxis dataKey="month" {...mobileXAxisProps} />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${(v / 100000).toFixed(0)}L`}
              width={28}
              tick={{ fontSize: 10 }}
            />
            <ChartTooltip
              content={({ active, payload }) => {
                if (!active || !payload?.[0]) return null;
                const row = payload[0].payload as { month: string; sales: number; orders: number };
                return (
                  <div className="rounded-xl border bg-card p-2 text-xs shadow-soft">
                    <p className="font-bold">{row.month}</p>
                    <p>{inr(row.sales)}</p>
                    <p className="text-muted-foreground">{row.orders} orders</p>
                  </div>
                );
              }}
            />
            <Line
              type="monotone"
              dataKey="sales"
              stroke="var(--color-sales)"
              strokeWidth={2}
              dot={{ r: 3 }}
              animationDuration={anim}
            />
          </LineChart>
        </ChartCard>
        {trendData.length > 0 && (
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {trendData.map((row) => (
              <li key={row.month} className="rounded-2xl border border-border bg-card px-3 py-2 shadow-soft">
                <p className="text-xs font-semibold text-muted-foreground">{row.month}</p>
                <p className="font-bold leading-tight">{inr(row.sales)}</p>
                <p className="text-xs text-muted-foreground">{row.orders} orders</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <RankingSection title="Top performers" rows={report.rankings.top.slice(0, 5)} anim={anim} onRowClick={onRowClick} onProfileClick={onProfileClick} profileLevel={report.rankings.level} />
        <RankingSection title="Needs attention" rows={report.rankings.bottom.slice(0, 5)} anim={anim} muted onRowClick={onRowClick} onProfileClick={onProfileClick} profileLevel={report.rankings.level} />
      </div>

      {topProducts.length > 0 && (
        <AdminSection title="Top products" description="Best sellers in selected period">
          <ChartCard title="" description="" config={barConfig} className="border-0 p-0 shadow-none">
            <BarChart data={topProducts} layout="vertical" margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E8DFD0" />
              <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={(v) => inrCompact(v)} tick={{ fontSize: 10 }} />
              <YAxis
                type="category"
                dataKey="product"
                tickLine={false}
                axisLine={false}
                width={64}
                tick={{ fontSize: 10 }}
              />
              <ChartTooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null;
                  const p = payload[0].payload as { fullProduct: string; sales: number };
                  return (
                    <div className="rounded-xl border bg-card p-2 text-xs shadow-soft">
                      <p className="font-bold">{p.fullProduct}</p>
                      <p>{inr(p.sales)}</p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="sales" fill="var(--color-sales)" radius={[0, 4, 4, 0]} animationDuration={anim} />
            </BarChart>
          </ChartCard>
        </AdminSection>
      )}
    </div>
  );
}
