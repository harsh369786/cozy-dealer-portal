import { createFileRoute } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import { DistributorShell } from "@/components/distributor-shell";
import { ChartCard } from "@/components/shared/chart-card";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { useAsyncData } from "@/hooks/use-async-data";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { getMonthlySales, getProductSales } from "@/services/reports";

export const Route = createFileRoute("/distributor/reports")({
  component: ReportsPage,
});

const lineConfig = { sales: { label: "Sales", color: "hsl(32 60% 50%)" } };
const barConfig = { units: { label: "Units", color: "hsl(32 60% 50%)" } };
const pieConfig = {
  Latexo: { label: "Latexo", color: "hsl(32 60% 50%)" },
  Orthomatic: { label: "Orthomatic", color: "hsl(28 55% 45%)" },
  "Delight Cool": { label: "Delight Cool", color: "hsl(36 50% 55%)" },
  "AquaFresh Plush": { label: "AquaFresh", color: "hsl(24 45% 60%)" },
  "Twin Plush": { label: "Twin Plush", color: "hsl(40 40% 65%)" },
};

const PIE_COLORS = [
  "hsl(32 60% 50%)",
  "hsl(28 55% 45%)",
  "hsl(36 50% 55%)",
  "hsl(24 45% 60%)",
  "hsl(40 40% 65%)",
];

function ReportsPage() {
  const reducedMotion = useReducedMotion();
  const simulateError =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("error") === "1";

  const salesQuery = useAsyncData(() => getMonthlySales(simulateError), [simulateError]);
  const productsQuery = useAsyncData(() => getProductSales(simulateError), [simulateError]);

  const loading = salesQuery.loading || productsQuery.loading;
  const error = salesQuery.error || productsQuery.error;

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
            productsQuery.retry();
          }}
        />
      </DistributorShell>
    );
  }

  const sales = salesQuery.data ?? [];
  const products = productsQuery.data ?? [];

  return (
    <DistributorShell title="Sales & Reports">
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Monthly Sales Trend"
          description="Revenue over 6 months"
          config={lineConfig}
        >
          <LineChart data={sales} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
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
              dot={false}
              animationDuration={reducedMotion ? 0 : 800}
            />
          </LineChart>
        </ChartCard>

        <ChartCard title="Orders by Month" description="Order volume" config={barConfig}>
          <BarChart data={sales} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="month" tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} width={28} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar
              dataKey="orders"
              fill="var(--color-units)"
              radius={[6, 6, 0, 0]}
              animationDuration={reducedMotion ? 0 : 800}
            />
          </BarChart>
        </ChartCard>

        <ChartCard
          title="Top Products"
          description="Sales by product line"
          config={pieConfig}
          className="lg:col-span-2"
        >
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent />} />
            <Pie
              data={products}
              dataKey="sales"
              nameKey="product"
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              animationDuration={reducedMotion ? 0 : 800}
            >
              {products.map((_, i) => (
                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ChartCard>

        <ChartCard
          title="Units Sold"
          description="By product"
          config={barConfig}
          className="lg:col-span-2"
        >
          <BarChart
            data={products}
            layout="vertical"
            margin={{ left: 8, right: 8, top: 8, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tickLine={false} axisLine={false} />
            <YAxis
              type="category"
              dataKey="product"
              tickLine={false}
              axisLine={false}
              width={100}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar
              dataKey="units"
              fill="var(--color-units)"
              radius={[0, 6, 6, 0]}
              animationDuration={reducedMotion ? 0 : 800}
            />
          </BarChart>
        </ChartCard>
      </div>
    </DistributorShell>
  );
}
