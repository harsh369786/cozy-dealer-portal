import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ChevronLeft } from "lucide-react";
import { AdminPermissionGate } from "@/components/admin/admin-permission-gate";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { useAsyncData } from "@/hooks/use-async-data";
import { useFormat } from "@/hooks/use-format";
import { getSalesExecutive } from "@/services/admin/sales-executives";

export const Route = createFileRoute("/admin/sales-executives/$seId")({
  component: SalesExecutiveDetailPage,
});

function formatDuration(minutes: number | null) {
  if (minutes == null) return "—";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function SalesExecutiveDetailPage() {
  return (
    <AdminPermissionGate permission="dealers:read">
      <DetailContent />
    </AdminPermissionGate>
  );
}

function DetailContent() {
  const { t } = useTranslation();
  const { seId } = useParams({ from: "/admin/sales-executives/$seId" });
  const { formatCurrency, formatNumber } = useFormat();

  const { data, loading, error, retry } = useAsyncData(() => getSalesExecutive(seId), [seId]);

  if (loading && !data) return <PageSkeleton rows={6} />;
  if (error && !data) return <ErrorState message={error} onRetry={retry} />;
  if (!data) return null;

  return (
    <div className="space-y-5">
      <Link
        to="/admin/sales-executives"
        className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        {t("admin.salesExecutives.title")}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold">{data.name}</h1>
          <p className="text-sm text-muted-foreground">
            {data.phone}
            {data.distributorName ? ` · ${data.distributorName}` : ""}
          </p>
        </div>
        <Badge
          variant={data.status === "active" ? "secondary" : "destructive"}
          className="capitalize"
        >
          {data.status.replace(/_/g, " ")}
        </Badge>
      </div>

      {/* Performance summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard
          label={t("admin.salesExecutives.dealers")}
          value={formatNumber(data.dealerCount)}
        />
        <StatCard
          label={t("admin.salesExecutives.totalVisits")}
          value={formatNumber(data.totalVisits)}
        />
        <StatCard
          label={t("admin.salesExecutives.visitsThisMonth")}
          value={formatNumber(data.visitsThisMonth)}
        />
        <StatCard
          label={t("admin.salesExecutives.orders")}
          value={formatNumber(data.totalOrders)}
        />
        <StatCard
          label={t("admin.salesExecutives.pending")}
          value={formatNumber(data.pendingOrders)}
        />
        <StatCard
          label={t("admin.salesExecutives.delivered")}
          value={formatNumber(data.deliveredOrders)}
        />
      </div>
      <div className="rounded-2xl border border-border bg-card px-4 py-3 shadow-soft">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("admin.salesExecutives.sales")}
        </p>
        <p className="mt-1 font-display text-2xl font-bold">{formatCurrency(data.salesValue)}</p>
      </div>

      {/* Assigned dealers */}
      <section className="rounded-3xl border border-border bg-card p-4 shadow-soft">
        <h2 className="mb-3 font-display font-bold">
          {t("admin.salesExecutives.assignedDealers")} ({data.dealers.length})
        </h2>
        {data.dealers.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("admin.salesExecutives.noDealers")}</p>
        ) : (
          <ul className="space-y-2">
            {data.dealers.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-2 rounded-2xl bg-secondary/40 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">{d.storeName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {d.code} · {d.location}
                  </p>
                </div>
                <Badge variant={d.active ? "secondary" : "outline"}>
                  {d.active ? t("common.active") : t("common.inactive")}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Recent visits */}
      <section className="rounded-3xl border border-border bg-card p-4 shadow-soft">
        <h2 className="mb-3 font-display font-bold">{t("admin.salesExecutives.recentVisits")}</h2>
        {data.recentVisits.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("distributor.visits.noVisitsYet")}</p>
        ) : (
          <ul className="space-y-2">
            {data.recentVisits.map((v) => (
              <li key={v.id} className="rounded-2xl bg-secondary/40 px-3 py-2 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{v.storeName}</p>
                    <p className="truncate text-xs text-muted-foreground">{v.dealerName}</p>
                  </div>
                  <StatusBadge kind="visit" status={v.status} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {v.checkInAt}
                  {v.checkOutAt ? ` → ${v.checkOutAt}` : ""} · {formatDuration(v.durationMinutes)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-3 py-2.5 text-center shadow-soft">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-display text-xl font-bold">{value}</p>
    </div>
  );
}
