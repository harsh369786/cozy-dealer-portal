import { createFileRoute } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
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
import { ChartTooltip, ChartTooltipContent, ChartContainer } from "@/components/ui/chart";
import { useAsyncData } from "@/hooks/use-async-data";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { inr } from "@/lib/demo-data";
import type { MonthlySales, ProductSales } from "@/lib/mock/distributor/types";
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

const labelStyle = { fontSize: 11, fontWeight: 600, fill: "oklch(0.52 0.03 62)" };

function MonthlySalesLegend({ sales }: { sales: MonthlySales[] }) {
  return (
    <ul className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 sm:grid-cols-3">
      {sales.map((row) => (
        <li key={row.month} className="rounded-2xl bg-secondary/60 px-3 py-2">
          <p className="text-xs font-semibold text-muted-foreground">{row.month}</p>
          <p className="font-bold leading-tight">{inr(row.sales)}</p>
          <p className="text-xs text-muted-foreground">{row.orders} orders</p>
        </li>
      ))}
    </ul>
  );
}

function ProductSalesLegend({ products }: { products: ProductSales[] }) {
  return (
    <ul className="mt-4 space-y-2 border-t border-border pt-4">
      {products.map((row, i) => (
        <li key={row.product} className="flex items-center justify-between gap-2 text-sm">
          <span className="flex min-w-0 items-center gap-2">
            <span
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
            />
            <span className="truncate font-semibold">{row.product}</span>
          </span>
          <span className="shrink-0 text-right">
            <span className="font-bold">{inr(row.sales)}</span>
            <span className="ml-2 text-muted-foreground">({row.units} units)</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

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
        <div className="rounded-3xl border border-border bg-card p-4 shadow-soft">
          <div className="mb-3">
            <h3 className="font-display font-bold">Monthly Sales Trend</h3>
            <p className="text-sm text-muted-foreground">Revenue over 6 months</p>
          </div>
          <ChartContainer config={lineConfig} className="aspect-auto h-44 w-full md:h-48">
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
                dot={{ r: 4, fill: "var(--color-sales)" }}
                animationDuration={reducedMotion ? 0 : 800}
              />
            </LineChart>
          </ChartContainer>
          <MonthlySalesLegend sales={sales} />
        </div>

        <ChartCard title="Orders by Month" description="Order volume" config={barConfig}>
          <BarChart data={sales} margin={{ left: 0, right: 8, top: 24, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="month" tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} width={28} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar
              dataKey="orders"
              fill="var(--color-units)"
              radius={[6, 6, 0, 0]}
              animationDuration={reducedMotion ? 0 : 800}
            >
              <LabelList dataKey="orders" position="top" offset={6} style={labelStyle} />
            </Bar>
          </BarChart>
        </ChartCard>

        <div className="rounded-3xl border border-border bg-card p-4 shadow-soft lg:col-span-2">
          <div className="mb-3">
            <h3 className="font-display font-bold">Top Products</h3>
            <p className="text-sm text-muted-foreground">Sales by product line</p>
          </div>
          <ChartContainer config={pieConfig} className="aspect-auto h-48 w-full md:h-56">
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
          </ChartContainer>
          <ProductSalesLegend products={products} />
        </div>

        <ChartCard
          title="Units Sold"
          description="By product"
          config={barConfig}
          className="lg:col-span-2"
        >
          <BarChart
            data={products}
            layout="vertical"
            margin={{ left: 8, right: 40, top: 8, bottom: 0 }}
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
            >
              <LabelList dataKey="units" position="right" offset={8} style={labelStyle} />
            </Bar>
          </BarChart>
        </ChartCard>
      </div>
    </DistributorShell>
  );
}
