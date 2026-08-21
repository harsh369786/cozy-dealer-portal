import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import type { AdminAnalyticsReport, AnalyticsFilters } from "@/lib/admin/analytics";
import type { HierarchyLevel, RankingRow } from "@/lib/admin/analytics/types";
import { ChartCard } from "@/components/shared/chart-card";
import { ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { inr, inrCompact } from "@/lib/demo-data";

export const PIE_COLORS = ["#B45309", "#0369A1", "#15803D", "#7C3AED", "#BE123C", "#0F766E"];
export const lineConfig = {
  sales: { label: "Sales", color: "#B45309" },
  orders: { label: "Orders", color: "#0369A1" },
};
export const barConfig = { sales: { label: "Sales", color: "#B45309" } };
export const unitsConfig = { units: { label: "Units", color: "#15803D" } };

export const LEVEL_TITLES: Record<HierarchyLevel, string> = {
  distributor: "Distributor performance",
  sales_executive: "Sales executive performance",
  dealer: "Dealer performance",
  product: "Product mix",
};

export function createRankingClickHandler(
  report: AdminAnalyticsReport,
  onDrillDown: (filters: AnalyticsFilters) => void,
) {
  return (row: RankingRow) => {
    const { level } = report.rankings;
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
}

export function RankingSection({
  title,
  rows,
  onRowClick,
  anim,
  muted,
}: {
  title: string;
  rows: RankingRow[];
  onRowClick?: (row: RankingRow) => void;
  anim: number;
  muted?: boolean;
}) {
  const data = rows.map((r) => ({
    ...r,
    label: r.name.length > 18 ? `${r.name.slice(0, 16)}…` : r.name,
  }));

  return (
    <ChartCard
      title={title}
      description={onRowClick ? "Click a bar to drill down" : "Sales for selected month"}
      config={barConfig}
    >
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
                <p>
                  {inr(r.sales)} · {r.orders} orders
                </p>
                <p className={r.growthPct >= 0 ? "text-emerald-700" : "text-rose-700"}>
                  {r.growthPct > 0 ? "+" : ""}
                  {r.growthPct}% growth
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
          className={onRowClick ? "cursor-pointer" : undefined}
          onClick={(data) => data?.payload && onRowClick?.(data.payload as RankingRow)}
        />
      </BarChart>
    </ChartCard>
  );
}

export function aggregateProductTrends(trends: AdminAnalyticsReport["productTrends"]) {
  const byMonth = new Map<string, Record<string, number | string>>();
  for (const t of trends) {
    const existing = byMonth.get(t.month) ?? { month: t.month };
    existing[t.product] = t.units;
    byMonth.set(t.month, existing);
  }
  return [...byMonth.values()] as Array<{ month: string } & Record<string, number | string>>;
}
