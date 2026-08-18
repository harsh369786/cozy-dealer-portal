import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  Package,
  Store,
  TrendingUp,
  Users,
  Gift,
  ShoppingBag,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { DistributorShell, DistSection } from "@/components/distributor-shell";
import { StatCard } from "@/components/shared/stat-card";
import { OrderCard } from "@/components/shared/order-card";
import { ChartCard } from "@/components/shared/chart-card";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/shared/states";
import { ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { useAsyncData } from "@/hooks/use-async-data";
import { inr } from "@/lib/demo-data";
import { getPendingOrders } from "@/services/orders";
import { getDashboardStats, getMonthlySales } from "@/services/reports";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

export const Route = createFileRoute("/distributor/dashboard")({
  component: DashboardPage,
});

const chartConfig = {
  sales: { label: "Sales", color: "hsl(var(--primary))" },
};

function DashboardPage() {
  const reducedMotion = useReducedMotion();
  const simulateError =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("error") === "1";

  const statsQuery = useAsyncData(() => getDashboardStats(simulateError), [simulateError]);
  const pendingQuery = useAsyncData(() => getPendingOrders(simulateError), [simulateError]);
  const salesQuery = useAsyncData(() => getMonthlySales(simulateError), [simulateError]);

  const loading = statsQuery.loading || pendingQuery.loading || salesQuery.loading;
  const error = statsQuery.error || pendingQuery.error || salesQuery.error;

  if (loading) {
    return (
      <DistributorShell title="Dashboard">
        <PageSkeleton rows={4} />
      </DistributorShell>
    );
  }

  if (error || !statsQuery.data) {
    return (
      <DistributorShell title="Dashboard">
        <ErrorState
          message={error ?? "Failed to load dashboard"}
          onRetry={() => {
            statsQuery.retry();
            pendingQuery.retry();
            salesQuery.retry();
          }}
        />
      </DistributorShell>
    );
  }

  const stats = statsQuery.data;
  const pending = pendingQuery.data ?? [];
  const sales = salesQuery.data ?? [];

  return (
    <DistributorShell title="Dashboard">
      <div className="animate-rise">
        <h1 className="font-display text-2xl font-bold">Distributor Hub</h1>
        <p className="mt-1 text-sm text-muted-foreground">Maharashtra Central region overview</p>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Total Dealers"
          value={stats.totalDealers}
          sub={`${stats.activeDealers} active`}
          icon={Users}
        />
        <StatCard label="Orders This Month" value={stats.ordersThisMonth} icon={ShoppingBag} />
        <StatCard
          label="Monthly Sales"
          value={inr(stats.monthlySales)}
          sub={`${stats.salesGrowth >= 0 ? "+" : ""}${stats.salesGrowth}% vs last month`}
          icon={TrendingUp}
        />
        <StatCard label="Pending Approvals" value={stats.pendingApprovals} icon={Package} />
        <StatCard label="Open Complaints" value={stats.openComplaints} icon={AlertTriangle} />
        <StatCard
          label="Reward Points"
          value={stats.rewardPointsGenerated.toLocaleString("en-IN")}
          icon={Gift}
        />
        <StatCard label="Active Dealers" value={stats.activeDealers} icon={Store} />
        <StatCard
          label="Approved Today"
          value={pending.length > 0 ? "—" : "All clear"}
          sub={pending.length > 0 ? `${pending.length} awaiting action` : "No pending orders"}
          icon={CheckCircle2}
        />
      </div>

      <DistSection
        title="Pending Approvals"
        action={
          <Link to="/distributor/orders" className="text-sm font-semibold text-primary">
            View all
          </Link>
        }
      >
        {pending.length === 0 ? (
          <EmptyState title="No pending orders" description="All orders have been reviewed." />
        ) : (
          <div className="space-y-3">
            {pending.slice(0, 3).map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        )}
      </DistSection>

      <DistSection title="Sales Trend">
        <ChartCard
          title="6-Month Sales"
          description="Revenue across your dealer network"
          config={chartConfig}
        >
          <AreaChart data={sales} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="month" tickLine={false} axisLine={false} />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${(v / 100000).toFixed(0)}L`}
              width={36}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Area
              type="monotone"
              dataKey="sales"
              stroke="var(--color-sales)"
              fill="var(--color-sales)"
              fillOpacity={0.2}
              animationDuration={reducedMotion ? 0 : 800}
            />
          </AreaChart>
        </ChartCard>
      </DistSection>
    </DistributorShell>
  );
}
