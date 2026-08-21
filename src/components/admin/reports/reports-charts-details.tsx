import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import type { AdminAnalyticsReport } from "@/lib/admin/analytics";
import { AdminSection } from "@/components/admin/admin-section";
import { ChartCard } from "@/components/shared/chart-card";
import { StatCard } from "@/components/shared/stat-card";
import { ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { inrCompact } from "@/lib/demo-data";
import {
  PIE_COLORS,
  aggregateProductTrends,
  barConfig,
  unitsConfig,
} from "./reports-charts-shared";

type Props = {
  report: AdminAnalyticsReport;
};

export function ReportsChartsDetails({ report }: Props) {
  const reducedMotion = useReducedMotion();
  const anim = reducedMotion ? 0 : 700;

  const productBarData = report.productPerformance.map((p) => ({
    product: p.product,
    sales: p.sales,
    units: p.units,
    growth: p.growthPct,
  }));

  const productTrendByMonth = aggregateProductTrends(report.productTrends);

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Product sales" description="By model" config={barConfig}>
          <BarChart data={productBarData} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8DFD0" />
            <XAxis dataKey="product" tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => inrCompact(v)} width={40} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="sales" fill="var(--color-sales)" radius={[6, 6, 0, 0]} animationDuration={anim} />
          </BarChart>
        </ChartCard>

        <ChartCard title="Product units trend" description="6-month quantity" config={unitsConfig}>
          <LineChart data={productTrendByMonth} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8DFD0" />
            <XAxis dataKey="month" tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} width={28} />
            <ChartTooltip content={<ChartTooltipContent />} />
            {[...new Set(report.productTrends.map((t) => t.product))].slice(0, 3).map((product, i) => (
              <Line
                key={product}
                type="monotone"
                dataKey={product}
                stroke={PIE_COLORS[i % PIE_COLORS.length]}
                strokeWidth={2}
                dot={false}
                animationDuration={anim}
              />
            ))}
          </LineChart>
        </ChartCard>
      </div>

      {report.campaigns.length > 0 && (
        <AdminSection title="Campaign performance" description="Active sell campaigns vs target">
          <div className="space-y-2">
            {report.campaigns.map((c) => (
              <div key={c.id} className="rounded-2xl bg-secondary/40 px-3 py-2">
                <div className="mb-1 flex justify-between text-sm">
                  <span className="font-bold">{c.name}</span>
                  <span className={c.pct < 50 ? "font-bold text-rose-600" : "font-bold"}>
                    {c.done}/{c.target} ({c.pct}%)
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.min(c.pct, 100)}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {c.product} · {c.daysLeft} days left
                </p>
              </div>
            ))}
          </div>
        </AdminSection>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Reward claims" value={report.rewardStats.totalClaims} />
        <StatCard label="Pending delivery" value={report.rewardStats.pendingClaims} />
        <StatCard
          label="Points outstanding"
          value={report.rewardStats.pointsOutstanding.toLocaleString("en-IN")}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Complaint trend" description="New complaints by month" config={unitsConfig}>
          <BarChart data={report.complaintTrend} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8DFD0" />
            <XAxis dataKey="month" tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} width={28} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="count" fill="#BE123C" radius={[6, 6, 0, 0]} animationDuration={anim} />
          </BarChart>
        </ChartCard>

        <ChartCard title="Approval vs rejection" description="Order decisions by month" config={barConfig}>
          <BarChart data={report.approvalTrend} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8DFD0" />
            <XAxis dataKey="month" tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} width={28} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="approved" stackId="a" fill="#15803D" radius={[0, 0, 0, 0]} animationDuration={anim} />
            <Bar dataKey="rejected" stackId="a" fill="#BE123C" animationDuration={anim} />
            <Bar dataKey="pending" stackId="a" fill="#B45309" radius={[6, 6, 0, 0]} animationDuration={anim} />
          </BarChart>
        </ChartCard>
      </div>
    </>
  );
}
