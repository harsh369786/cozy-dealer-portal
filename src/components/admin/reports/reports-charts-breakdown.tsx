import { Cell, Pie, PieChart, Scatter, ScatterChart, XAxis, YAxis, ZAxis } from "recharts";
import { CartesianGrid } from "recharts";
import type { AdminAnalyticsReport, AnalyticsFilters } from "@/lib/admin/analytics";
import { ChartCard } from "@/components/shared/chart-card";
import { ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { inr, inrCompact } from "@/lib/demo-data";
import {
  LEVEL_TITLES,
  PIE_COLORS,
  RankingSection,
  createRankingClickHandler,
} from "./reports-charts-shared";

type Props = {
  report: AdminAnalyticsReport;
  onDrillDown: (filters: AnalyticsFilters) => void;
};

export function ReportsChartsBreakdown({ report, onDrillDown }: Props) {
  const reducedMotion = useReducedMotion();
  const anim = reducedMotion ? 0 : 700;
  const handleRankingClick = createRankingClickHandler(report, onDrillDown);

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <RankingSection
          title={`Bottom — ${LEVEL_TITLES[report.rankings.level]}`}
          rows={report.rankings.bottom}
          onRowClick={handleRankingClick}
          anim={anim}
          muted
        />

        {report.scopeLevel === "overall" && report.distributorShare.length > 0 && (
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
                const p = payload[0].payload as {
                  name: string;
                  orders: number;
                  sales: number;
                  vsAvgSalesPct: number;
                };
                return (
                  <div className="rounded-xl border bg-card p-2 text-xs shadow-soft">
                    <p className="font-bold">{p.name}</p>
                    <p>
                      {p.orders} orders · {inr(p.sales)}
                    </p>
                    <p className="text-muted-foreground">
                      {p.vsAvgSalesPct > 0 ? "+" : ""}
                      {p.vsAvgSalesPct}% vs avg
                    </p>
                  </div>
                );
              }}
            />
            <Scatter data={report.dealerScatter} fill="#B45309" animationDuration={anim} />
          </ScatterChart>
        </ChartCard>
      )}
    </>
  );
}
