import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  Megaphone,
  Package,
  ShoppingBag,
  Store,
  TrendingUp,
  Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminSection } from "@/components/admin/admin-section";
import { AdminDataTable } from "@/components/admin/admin-data-table";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { useAsyncData } from "@/hooks/use-async-data";
import { useAdminPermissions } from "@/hooks/use-admin-permissions";
import { useFormat } from "@/hooks/use-format";
import { getAdminDashboard } from "@/services/admin/dashboard";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboardPage,
});

function AdminDashboardPage() {
  const { t } = useTranslation();
  const { formatCurrency } = useFormat();
  const navigate = useNavigate();
  const { can } = useAdminPermissions();
  const canExplore = can("reports:read");
  const { data, loading, error, retry } = useAsyncData(() => getAdminDashboard(), []);

  if (loading && !data) return <PageSkeleton rows={4} />;
  if ((error || !data) && !loading) {
    return (
      <ErrorState message={error ?? t("errors.failedToLoadDashboard")} onRetry={retry} />
    );
  }

  const { stats } = data!;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={t("admin.dashboard.title")}
        description={t("admin.dashboard.description")}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={
            stats.currentMonthLabel
              ? t("admin.dashboard.salesMonthLabel", { month: stats.currentMonthLabel })
              : t("admin.dashboard.salesMtd")
          }
          value={formatCurrency(stats.monthlySales)}
          sub={
            stats.previousMonthLabel && stats.salesGrowth != null
              ? `${stats.salesGrowth >= 0 ? "+" : ""}${stats.salesGrowth}% vs ${stats.previousMonthLabel}`
              : undefined
          }
          icon={TrendingUp}
          onClick={canExplore ? () => navigate({ to: "/admin/explore", search: { metric: "sales" } }) : undefined}
        />
        <StatCard
          label={t("admin.dashboard.orders")}
          value={stats.totalOrders}
          icon={ShoppingBag}
          onClick={canExplore ? () => navigate({ to: "/admin/explore", search: { metric: "orders" } }) : () => navigate({ to: "/admin/orders" })}
        />
        <StatCard
          label={t("admin.dashboard.dealers")}
          value={stats.totalDealers}
          icon={Store}
          onClick={canExplore ? () => navigate({ to: "/admin/explore", search: { metric: "sales", level: "all_dealers" } }) : undefined}
        />
        <StatCard
          label={t("admin.dashboard.distributors")}
          value={stats.totalDistributors}
          icon={Users}
          onClick={canExplore ? () => navigate({ to: "/admin/explore", search: { metric: "sales" } }) : undefined}
        />
        <StatCard
          label={t("admin.dashboard.pendingApprovals")}
          value={stats.pendingApprovals}
          icon={Package}
          onClick={() => navigate({ to: "/admin/orders", search: { status: "order_placed" } })}
        />
        <StatCard
          label={t("admin.dashboard.openComplaints")}
          value={stats.openComplaints}
          icon={AlertTriangle}
          onClick={() => navigate({ to: "/admin/complaints" })}
        />
        <StatCard
          label={t("admin.dashboard.activeCampaigns")}
          value={stats.activeCampaigns}
          icon={Megaphone}
          onClick={() => navigate({ to: "/admin/campaigns" })}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <AdminSection
          title={t("admin.dashboard.monthlySalesTrend")}
          description={t("admin.dashboard.monthlySalesTrendDesc")}
        >
          <div className="space-y-3">
            {data!.monthlySales.map((row) => {
              const max = Math.max(...data!.monthlySales.map((m) => m.sales), 1);
              return (
                <div key={row.month}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="font-semibold">{row.month}</span>
                    <span className="font-bold">{formatCurrency(row.sales)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${(row.sales / max) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </AdminSection>

        <AdminSection title={t("admin.dashboard.topProducts")}>
          <div className="space-y-2">
            {data!.topProducts.slice(0, 5).map((p) => (
              <div key={p.product} className="flex items-center justify-between rounded-2xl bg-secondary/40 px-3 py-2 text-sm">
                <span className="font-semibold">{p.product}</span>
                <span className="font-bold">{formatCurrency(p.sales)}</span>
              </div>
            ))}
          </div>
        </AdminSection>
      </div>

      <AdminSection
        title={t("admin.dashboard.recentOrders")}
        description={t("admin.dashboard.recentOrdersDesc")}
      >
        <AdminDataTable
          data={data!.recentOrders}
          keyFn={(o) => o.id}
          onRowClick={(o) => navigate({ to: "/admin/orders/$orderId", params: { orderId: o.id } })}
          columns={[
            { key: "id", header: t("admin.dashboard.columnOrder"), cell: (o) => <span className="font-bold">#{o.id}</span> },
            { key: "dealer", header: t("admin.dashboard.columnDealer"), cell: (o) => o.dealerName },
            { key: "status", header: t("admin.dashboard.columnStatus"), cell: (o) => <StatusBadge kind="order" status={o.status} /> },
            { key: "value", header: t("admin.dashboard.columnValue"), cell: (o) => formatCurrency(o.totalValue), hideOnMobile: true },
          ]}
        />
      </AdminSection>

      {data!.pendingSignups.length > 0 && (
        <AdminSection title={t("admin.dashboard.pendingSignups")}>
          <div className="space-y-2">
            {data!.pendingSignups.map((s) => (
              <Link
                key={s.id}
                to="/admin/users"
                search={{ tab: "signup" }}
                className="flex items-center justify-between rounded-2xl border border-border px-4 py-3 hover:bg-secondary/40"
              >
                <div>
                  <p className="font-bold">{s.businessName}</p>
                  <p className="text-sm text-muted-foreground">{s.contactName} · {s.city}</p>
                </div>
                <span className="text-xs font-bold text-amber-700">{t("common.viewDetails")}</span>
              </Link>
            ))}
          </div>
        </AdminSection>
      )}

      {data!.openComplaints.length > 0 && (
        <AdminSection title={t("admin.dashboard.openComplaints")}>
          <AdminDataTable
            data={data!.openComplaints.slice(0, 5)}
            keyFn={(c) => c.id}
            onRowClick={(c) => navigate({ to: "/admin/complaints/$complaintId", params: { complaintId: c.id } })}
            columns={[
              { key: "id", header: t("common.reference"), cell: (c) => c.id },
              { key: "dealer", header: t("admin.dashboard.columnDealer"), cell: (c) => c.dealerName },
              { key: "status", header: t("admin.dashboard.columnStatus"), cell: (c) => <StatusBadge kind="complaint" status={c.status} /> },
            ]}
          />
        </AdminSection>
      )}
    </div>
  );
}
