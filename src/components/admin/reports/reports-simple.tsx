import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import type { AdminAnalyticsReport } from "@/lib/admin/analytics";
import { ChartCard } from "@/components/shared/chart-card";
import { ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { inr, inrCompact } from "@/lib/demo-data";
import { AdminSection } from "@/components/admin/admin-section";
import type { AnalyticsFilters } from "@/lib/admin/analytics";
import { barConfig, createRankingClickHandler, lineConfig, RankingSection } from "./reports-charts-shared";

const KEY_KPI_IDS = ["sales", "orders", "pending_approvals", "open_complaints"] as const;

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
  const onRowClick = onDrillDown ? createRankingClickHandler(report, onDrillDown) : undefined;

  const trendData = report.salesTrend.slice(-6).map((t) => ({
    month: t.month,
    sales: t.sales,
    orders: t.orders,
  }));

  const topProducts = report.productPerformance.slice(0, 5).map((p) => ({
    product: p.product,
    sales: p.sales,
  }));

  return (
    <div className="min-w-0 space-y-6">
      <ChartCard title="Sales trend" description="Last 6 months" config={lineConfig}>
        <LineChart data={trendData} margin={{ left: 0, right: 4, top: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8DFD0" />
          <XAxis dataKey="month" tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${(v / 100000).toFixed(0)}L`}
            width={32}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
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

      <div className="grid gap-4 lg:grid-cols-2">
        <RankingSection title="Top performers" rows={report.rankings.top.slice(0, 5)} anim={anim} onRowClick={onRowClick} />
        <RankingSection title="Needs attention" rows={report.rankings.bottom.slice(0, 5)} anim={anim} muted onRowClick={onRowClick} />
      </div>

      {topProducts.length > 0 && (
        <AdminSection title="Top products" description="Best sellers this month">
          <ChartCard title="" description="" config={barConfig} className="border-0 p-0 shadow-none">
            <BarChart data={topProducts} margin={{ left: 0, right: 4, top: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8DFD0" />
              <XAxis
                dataKey="product"
                tickLine={false}
                axisLine={false}
                interval={0}
                angle={-25}
                textAnchor="end"
                height={56}
                tick={{ fontSize: 11 }}
              />
              <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => inrCompact(v)} width={36} />
              <ChartTooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null;
                  const p = payload[0].payload as { product: string; sales: number };
                  return (
                    <div className="rounded-xl border bg-card p-2 text-xs shadow-soft">
                      <p className="font-bold">{p.product}</p>
                      <p>{inr(p.sales)}</p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="sales" fill="var(--color-sales)" radius={[6, 6, 0, 0]} animationDuration={anim} />
            </BarChart>
          </ChartCard>
        </AdminSection>
      )}
    </div>
  );
}
