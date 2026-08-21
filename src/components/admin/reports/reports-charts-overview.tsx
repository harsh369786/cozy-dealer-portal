import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import type { AdminAnalyticsReport, AnalyticsFilters } from "@/lib/admin/analytics";
import { ChartCard } from "@/components/shared/chart-card";
import { ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import {
  LEVEL_TITLES,
  RankingSection,
  createRankingClickHandler,
  lineConfig,
} from "./reports-charts-shared";

type Props = {
  report: AdminAnalyticsReport;
  onDrillDown: (filters: AnalyticsFilters) => void;
};

export function ReportsChartsOverview({ report, onDrillDown }: Props) {
  const reducedMotion = useReducedMotion();
  const anim = reducedMotion ? 0 : 700;
  const handleRankingClick = createRankingClickHandler(report, onDrillDown);

  const trendData = report.salesTrend.map((t) => ({
    month: t.month,
    sales: t.sales,
    orders: t.orders,
  }));

  return (
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
        title={`Top — ${LEVEL_TITLES[report.rankings.level]}`}
        rows={report.rankings.top}
        onRowClick={handleRankingClick}
        anim={anim}
      />
    </div>
  );
}
