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
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminSection } from "@/components/admin/admin-section";
import { AdminDataTable } from "@/components/admin/admin-data-table";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { useAsyncData } from "@/hooks/use-async-data";
import { inr, inrCompact } from "@/lib/demo-data";
import { getAdminDashboard } from "@/services/admin/dashboard";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboardPage,
});

function AdminDashboardPage() {
  const navigate = useNavigate();
  const { data, loading, error, retry } = useAsyncData(() => getAdminDashboard(), []);

  if (loading) return <PageSkeleton rows={4} />;
  if (error || !data) return <ErrorState message={error ?? "Failed to load dashboard"} onRetry={retry} />;

  const { stats } = data;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Dashboard"
        description="Sales, orders, dealers and key operational metrics."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Sales (MTD)" value={inrCompact(stats.monthlySales)} icon={TrendingUp} />
        <StatCard label="Orders" value={stats.totalOrders} icon={ShoppingBag} />
        <StatCard label="Dealers" value={stats.totalDealers} icon={Store} />
        <StatCard label="Distributors" value={stats.totalDistributors} icon={Users} />
        <StatCard label="Pending approvals" value={stats.pendingApprovals} icon={Package} />
        <StatCard label="Open complaints" value={stats.openComplaints} icon={AlertTriangle} />
        <StatCard label="Active campaigns" value={stats.activeCampaigns} icon={Megaphone} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <AdminSection title="Monthly sales trend">
          <div className="space-y-3">
            {data.monthlySales.map((row) => {
              const max = Math.max(...data.monthlySales.map((m) => m.sales), 1);
              return (
                <div key={row.month}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="font-semibold">{row.month}</span>
                    <span className="font-bold">{inr(row.sales)}</span>
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

        <AdminSection title="Top products">
          <div className="space-y-2">
            {data.topProducts.slice(0, 5).map((p) => (
              <div key={p.product} className="flex items-center justify-between rounded-2xl bg-secondary/40 px-3 py-2 text-sm">
                <span className="font-semibold">{p.product}</span>
                <span className="font-bold">{inr(p.sales)}</span>
              </div>
            ))}
          </div>
        </AdminSection>
      </div>

      <AdminSection title="Recent orders" description="Latest 5 orders across the network.">
        <AdminDataTable
          data={data.recentOrders}
          keyFn={(o) => o.id}
          onRowClick={(o) => navigate({ to: "/admin/orders/$orderId", params: { orderId: o.id } })}
          columns={[
            { key: "id", header: "Order", cell: (o) => <span className="font-bold">#{o.id}</span> },
            { key: "dealer", header: "Dealer", cell: (o) => o.dealerName },
            { key: "status", header: "Status", cell: (o) => <StatusBadge kind="order" status={o.status} /> },
            { key: "value", header: "Value", cell: (o) => inr(o.totalValue), hideOnMobile: true },
          ]}
        />
      </AdminSection>

      {data.pendingSignups.length > 0 && (
        <AdminSection title="Pending signups">
          <div className="space-y-2">
            {data.pendingSignups.map((s) => (
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
                <span className="text-xs font-bold text-amber-700">Review</span>
              </Link>
            ))}
          </div>
        </AdminSection>
      )}

      {data.openComplaints.length > 0 && (
        <AdminSection title="Open complaints">
          <AdminDataTable
            data={data.openComplaints.slice(0, 5)}
            keyFn={(c) => c.id}
            onRowClick={(c) => navigate({ to: "/admin/complaints/$complaintId", params: { complaintId: c.id } })}
            columns={[
              { key: "id", header: "ID", cell: (c) => c.id },
              { key: "dealer", header: "Dealer", cell: (c) => c.dealerName },
              { key: "status", header: "Status", cell: (c) => <StatusBadge kind="complaint" status={c.status} /> },
            ]}
          />
        </AdminSection>
      )}
    </div>
  );
}
