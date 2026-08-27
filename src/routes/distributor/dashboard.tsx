import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  CheckCircle2,
  MapPin,
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
import { useFormat } from "@/hooks/use-format";
import { useSession } from "@/hooks/use-session";
import type { MonthlySales } from "@/lib/mock/distributor/types";
import { getPendingOrders } from "@/services/orders";
import { getDashboardStats, getMonthlySales } from "@/services/reports";

export const Route = createFileRoute("/distributor/dashboard")({
  component: DashboardPage,
});

function SalesTrendSimple({ data }: { data: MonthlySales[] }) {
  const { t } = useTranslation();
  const { formatCurrency, formatNumber } = useFormat();
  const rows = [...data].reverse();
  const max = Math.max(...rows.map((d) => d.sales), 1);

  return (
    <div className="rounded-3xl border border-border bg-card p-4 shadow-soft">
      <p className="text-sm text-muted-foreground">{t("distributor.dashboard.salesTrendBarHint")}</p>
      <div className="mt-4 space-y-4">
        {rows.map((row) => (
          <div key={`${row.month}-${row.sales}`}>
            <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
              <span className="shrink-0 font-semibold">{row.month || "—"}</span>
              <span className="truncate font-bold">{formatCurrency(row.sales)}</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${(row.sales / max) * 100}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatNumber(row.orders)} {t("common.orders")}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DashboardPage() {
  const { t } = useTranslation();
  const { formatCurrency, formatNumber } = useFormat();
  const { user, role } = useSession();
  const simulateError =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("error") === "1";

  const statsQuery = useAsyncData(() => getDashboardStats(simulateError), [simulateError]);
  const pendingQuery = useAsyncData(() => getPendingOrders(simulateError), [simulateError]);
  const salesQuery = useAsyncData(() => getMonthlySales(simulateError), [simulateError]);

  useEffect(() => {
    const refresh = () => {
      statsQuery.retry();
      pendingQuery.retry();
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("backrest:dashboard-refresh", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("backrest:dashboard-refresh", refresh);
    };
  }, [statsQuery.retry, pendingQuery.retry]);

  const loading = statsQuery.loading || pendingQuery.loading || salesQuery.loading;
  const error = statsQuery.error || pendingQuery.error || salesQuery.error;

  if (loading) {
    return (
      <DistributorShell title={t("distributor.dashboard.title")}>
        <PageSkeleton rows={4} />
      </DistributorShell>
    );
  }

  if (error || !statsQuery.data) {
    return (
      <DistributorShell title={t("distributor.dashboard.title")}>
        <ErrorState
          message={error ?? t("errors.failedToLoadDashboard")}
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
    <DistributorShell title={t("distributor.dashboard.title")}>
      <div className="animate-rise">
        <h1 className="font-display text-2xl font-bold">
          {role === "sales_executive"
            ? t("distributor.dashboard.salesExecutiveHub")
            : t("distributor.dashboard.distributorHub")}
        </h1>
        <p className="mt-1 text-sm font-semibold text-muted-foreground">
          {user?.name ?? t("common.distributor")}
        </p>
      </div>

      {role === "sales_executive" && (
        <Link
          to="/distributor/visits"
          className="press mt-5 flex items-center gap-4 rounded-3xl border-2 border-primary/30 bg-primary/5 p-4 shadow-soft"
        >
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <MapPin className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg font-bold">{t("distributor.dashboard.checkInVisit")}</p>
            <p className="text-sm text-muted-foreground">{t("distributor.dashboard.checkInVisitDesc")}</p>
          </div>
        </Link>
      )}

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={t("distributor.dashboard.totalDealers")}
          value={stats.totalDealers}
          sub={t("distributor.dashboard.activeCount", { count: stats.activeDealers })}
          icon={Users}
          href="/distributor/dealers"
        />
        <StatCard
          label={
            stats.currentMonthLabel
              ? t("distributor.dashboard.ordersMonthLabel", { month: stats.currentMonthLabel })
              : t("distributor.dashboard.ordersThisMonth")
          }
          value={stats.ordersThisMonth}
          icon={ShoppingBag}
          href="/distributor/orders"
        />
        <StatCard
          label={
            stats.currentMonthLabel
              ? t("distributor.dashboard.salesMonthLabel", { month: stats.currentMonthLabel })
              : t("distributor.dashboard.monthlySales")
          }
          value={formatCurrency(stats.monthlySales)}
          valueTitle={formatCurrency(stats.monthlySales)}
          sub={
            stats.previousMonthLabel
              ? t("distributor.dashboard.salesGrowthVs", {
                  sign: stats.salesGrowth >= 0 ? "+" : "",
                  percent: stats.salesGrowth,
                  period: stats.previousMonthLabel,
                })
              : t("distributor.dashboard.salesGrowthVsLastMonth", {
                  sign: stats.salesGrowth >= 0 ? "+" : "",
                  percent: stats.salesGrowth,
                })
          }
          icon={TrendingUp}
          href="/distributor/reports"
        />
        <StatCard
          label={t("distributor.dashboard.pendingApprovals")}
          value={stats.pendingApprovals}
          icon={Package}
          href="/distributor/orders"
        />
        <StatCard
          label={t("distributor.dashboard.openComplaints")}
          value={stats.openComplaints}
          icon={AlertTriangle}
          href="/distributor/complaints"
        />
        <StatCard
          label={t("distributor.dashboard.rewardPointsGenerated")}
          value={formatNumber(stats.rewardPointsGenerated)}
          valueTitle={formatNumber(stats.rewardPointsGenerated)}
          icon={Gift}
          href="/distributor/rewards"
        />
        <StatCard
          label={t("distributor.dashboard.activeDealers")}
          value={stats.activeDealers}
          icon={Store}
          href="/distributor/dealers"
        />
        <StatCard
          label={t("distributor.dashboard.approvedToday")}
          value={stats.approvedToday ?? 0}
          sub={t("distributor.dashboard.approvedTodaySub")}
          icon={CheckCircle2}
          href="/distributor/orders"
        />
      </div>

      <DistSection
        title={t("distributor.dashboard.pendingApprovals")}
        action={
          <Link to="/distributor/orders" className="text-sm font-semibold text-primary">
            {t("common.viewAll")}
          </Link>
        }
      >
        {pending.length === 0 ? (
          <EmptyState
            title={t("distributor.dashboard.noPendingOrders")}
            description={t("distributor.dashboard.allOrdersReviewed")}
          />
        ) : (
          <div className="space-y-3">
            {pending.slice(0, 3).map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        )}
      </DistSection>

      <DistSection
        title={t("distributor.dashboard.salesTrend")}
        description={t("distributor.dashboard.salesTrendDesc")}
      >
        <SalesTrendSimple data={sales} />
      </DistSection>
    </DistributorShell>
  );
}
