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
import { DistributorShell, DistSection } from "@/components/distributor-shell";
import { StatCard } from "@/components/shared/stat-card";
import { OrderCard } from "@/components/shared/order-card";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/shared/states";
import { useAsyncData } from "@/hooks/use-async-data";
import { useSession } from "@/hooks/use-session";
import { compactNumber, inr, inrCompact } from "@/lib/demo-data";
import type { MonthlySales } from "@/lib/mock/distributor/types";
import { getPendingOrders } from "@/services/orders";
import { getDashboardStats, getMonthlySales } from "@/services/reports";

export const Route = createFileRoute("/distributor/dashboard")({
  component: DashboardPage,
});

function SalesTrendSimple({ data }: { data: MonthlySales[] }) {
  const max = Math.max(...data.map((d) => d.sales), 1);

  return (
    <div className="rounded-3xl border border-border bg-card p-4 shadow-soft">
      <p className="text-sm text-muted-foreground">Each bar shows how that month compares to your best month.</p>
      <div className="mt-4 space-y-4">
        {data.map((row) => (
          <div key={row.month}>
            <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
              <span className="w-10 font-semibold">{row.month}</span>
              <span className="font-bold">{inr(row.sales)}</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${(row.sales / max) * 100}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{row.orders} orders</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DashboardPage() {
  const { user } = useSession();
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
        <p className="mt-1 text-sm font-semibold text-muted-foreground">{user?.name ?? "Distributor"}</p>
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
          value={inrCompact(stats.monthlySales)}
          valueTitle={inr(stats.monthlySales)}
          sub={`${stats.salesGrowth >= 0 ? "+" : ""}${stats.salesGrowth}% vs last month`}
          icon={TrendingUp}
        />
        <StatCard label="Pending Approvals" value={stats.pendingApprovals} icon={Package} />
        <StatCard label="Open Complaints" value={stats.openComplaints} icon={AlertTriangle} />
        <StatCard
          label="Reward Points"
          value={compactNumber(stats.rewardPointsGenerated)}
          valueTitle={stats.rewardPointsGenerated.toLocaleString("en-IN")}
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
        <SalesTrendSimple data={sales} />
      </DistSection>
    </DistributorShell>
  );
}
