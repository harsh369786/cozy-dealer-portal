import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import type { AdminAnalyticsReport, AnalyticsFilters } from "@/lib/admin/analytics";
import { AdminSection } from "@/components/admin/admin-section";
import { ChartCard } from "@/components/shared/chart-card";
import { StatCard } from "@/components/shared/stat-card";
import { ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { inr, inrCompact } from "@/lib/demo-data";
import type { HierarchyLevel, RankingRow } from "@/lib/admin/analytics/types";

const PIE_COLORS = ["#B45309", "#0369A1", "#15803D", "#7C3AED", "#BE123C", "#0F766E"];
const lineConfig = {
  sales: { label: "Sales", color: "#B45309" },
  orders: { label: "Orders", color: "#0369A1" },
};
const barConfig = { sales: { label: "Sales", color: "#B45309" } };
const unitsConfig = { units: { label: "Units", color: "#15803D" } };

const LEVEL_TITLES: Record<HierarchyLevel, string> = {
  distributor: "Distributor performance",
  sales_executive: "Sales executive performance",
  dealer: "Dealer performance",
  product: "Product mix",
};

type Props = {
  report: AdminAnalyticsReport;
  onDrillDown: (filters: AnalyticsFilters) => void;
};

export function ReportsCharts({ report, onDrillDown }: Props) {
  const reducedMotion = useReducedMotion();
  const anim = reducedMotion ? 0 : 700;
  const { rankings, scopeLevel } = report;

  const trendData = report.salesTrend.map((t) => ({
    month: t.month,
    sales: t.sales,
    orders: t.orders,
  }));

  const productBarData = report.productPerformance.map((p) => ({
    product: p.product,
    sales: p.sales,
    units: p.units,
    growth: p.growthPct,
  }));

  const productTrendByMonth = aggregateProductTrends(report.productTrends);

  const handleRankingClick = (row: RankingRow) => {
    const { level } = rankings;
    if (level === "distributor") {
      onDrillDown({ ...report.filters, distributorId: row.id });
    } else if (level === "sales_executive") {
      onDrillDown({ ...report.filters, salesExecutiveId: row.id });
    } else if (level === "dealer") {
      onDrillDown({ ...report.filters, dealerId: row.id });
    } else {
      onDrillDown({ ...report.filters, product: row.id });
    }
  };

  return (
    <div className="space-y-6 print:space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Sales & orders trend"
          description="Revenue and order volume over time"
          config={lineConfig}
        >
          <LineChart data={trendData} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8DFD0" />
            <XAxis dataKey="month" tickLine={false} axisLine={false} />
            <YAxis
              yAxisId="sales"
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${(v / 100000).toFixed(0)}L`}
              width={36}
            />
            <YAxis yAxisId="orders" orientation="right" tickLine={false} axisLine={false} width={28} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Line
              yAxisId="sales"
              type="monotone"
              dataKey="sales"
              stroke="var(--color-sales)"
              strokeWidth={2}
              dot={{ r: 3 }}
              animationDuration={anim}
            />
            <Line
              yAxisId="orders"
              type="monotone"
              dataKey="orders"
              stroke="var(--color-orders)"
              strokeWidth={2}
              dot={{ r: 3 }}
              animationDuration={anim}
            />
          </LineChart>
        </ChartCard>

        <RankingSection
          title={`Top — ${LEVEL_TITLES[rankings.level]}`}
          rows={rankings.top}
          onRowClick={handleRankingClick}
          anim={anim}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <RankingSection
          title={`Bottom — ${LEVEL_TITLES[rankings.level]}`}
          rows={rankings.bottom}
          onRowClick={handleRankingClick}
          anim={anim}
          muted
        />

        {scopeLevel === "overall" && report.distributorShare.length > 0 && (
          <ChartCard
            title="Distributor sales contribution"
            description="Share of network revenue"
            config={Object.fromEntries(
              report.distributorShare.map((d, i) => [
                d.name,
                { label: d.name, color: PIE_COLORS[i % PIE_COLORS.length] },
              ]),
            )}
          >
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent />} />
              <Pie
                data={report.distributorShare}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                animationDuration={anim}
              >
                {report.distributorShare.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </ChartCard>
        )}
      </div>

      {report.dealerScatter.length > 0 && (
        <ChartCard
          title="Dealer productivity"
          description="Orders vs sales — bubble size = relative performance"
          config={{ sales: { label: "Sales", color: "#B45309" } }}
        >
          <ScatterChart margin={{ left: 8, right: 16, top: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E8DFD0" />
            <XAxis type="number" dataKey="orders" name="Orders" tickLine={false} axisLine={false} />
            <YAxis
              type="number"
              dataKey="sales"
              name="Sales"
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => inrCompact(v)}
            />
            <ZAxis type="number" dataKey="vsAvgSalesPct" range={[40, 400]} />
            <ChartTooltip
              cursor={{ strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                if (!active || !payload?.[0]) return null;
                const p = payload[0].payload as { name: string; orders: number; sales: number; vsAvgSalesPct: number };
                return (
                  <div className="rounded-xl border bg-card p-2 text-xs shadow-soft">
                    <p className="font-bold">{p.name}</p>
                    <p>{p.orders} orders · {inr(p.sales)}</p>
                    <p className="text-muted-foreground">{p.vsAvgSalesPct > 0 ? "+" : ""}{p.vsAvgSalesPct}% vs avg</p>
                  </div>
                );
              }}
            />
            <Scatter data={report.dealerScatter} fill="#B45309" animationDuration={anim} />
          </ScatterChart>
        </ChartCard>
      )}

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
                <p className="mt-1 text-xs text-muted-foreground">{c.product} · {c.daysLeft} days left</p>
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
    </div>
  );
}

function RankingSection({
  title,
  rows,
  onRowClick,
  anim,
  muted,
}: {
  title: string;
  rows: RankingRow[];
  onRowClick: (row: RankingRow) => void;
  anim: number;
  muted?: boolean;
}) {
  const data = rows.map((r) => ({
    ...r,
    label: r.name.length > 18 ? `${r.name.slice(0, 16)}…` : r.name,
  }));

  return (
    <ChartCard title={title} description="Click a bar to drill down" config={barConfig}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ left: 8, right: 48, top: 8, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E8DFD0" />
        <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={(v) => inrCompact(v)} />
        <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} width={100} />
        <ChartTooltip
          content={({ active, payload }) => {
            if (!active || !payload?.[0]) return null;
            const r = payload[0].payload as RankingRow;
            return (
              <div className="rounded-xl border bg-card p-2 text-xs shadow-soft">
                <p className="font-bold">{r.name}</p>
                <p>{inr(r.sales)} · {r.orders} orders</p>
                <p className={r.growthPct >= 0 ? "text-emerald-700" : "text-rose-700"}>
                  {r.growthPct > 0 ? "+" : ""}{r.growthPct}% growth
                </p>
              </div>
            );
          }}
        />
        <Bar
          dataKey="sales"
          fill={muted ? "#A8A29E" : "var(--color-sales)"}
          radius={[0, 6, 6, 0]}
          animationDuration={anim}
          className="cursor-pointer"
          onClick={(data) => data?.payload && onRowClick(data.payload as RankingRow)}
        />
      </BarChart>
    </ChartCard>
  );
}

function aggregateProductTrends(trends: AdminAnalyticsReport["productTrends"]) {
  const byMonth = new Map<string, Record<string, number | string>>();
  for (const t of trends) {
    const existing = byMonth.get(t.month) ?? { month: t.month };
    existing[t.product] = t.units;
    byMonth.set(t.month, existing);
  }
  return [...byMonth.values()] as Array<{ month: string } & Record<string, number | string>>;
}
