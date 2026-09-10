import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ShoppingBag, Gift, MapPin, BarChart3, Pencil } from "lucide-react";
import { AdminPermissionGate } from "@/components/admin/admin-permission-gate";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorState, PageSkeleton, EmptyState } from "@/components/shared/states";
import { useAsyncData } from "@/hooks/use-async-data";
import { useAdminPermissions } from "@/hooks/use-admin-permissions";
import { useFormat } from "@/hooks/use-format";
import { getDealerById, getDealerPerformance } from "@/services/dealers";
import { getDealerOrders, getDealerRewards } from "@/services/admin/dealer-profile";
import { listAdminVisits } from "@/services/admin/visits";
import type { DistributorDealer, DistributorOrder } from "@/lib/mock/distributor/types";

type ProfileTab = "overview" | "personal" | "orders" | "rewards" | "visits";
const TABS: ProfileTab[] = ["overview", "personal", "orders", "rewards", "visits"];

type Search = { tab: ProfileTab };

export const Route = createFileRoute("/admin/dealers/$dealerId")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    tab: (TABS.includes(s.tab as ProfileTab) ? (s.tab as ProfileTab) : "overview"),
  }),
  component: DealerProfilePage,
});

function DealerProfilePage() {
  // The whole profile is dealer data — gate on dealers:read (read-only oversight roles included).
  return (
    <AdminPermissionGate permission="dealers:read">
      <ProfileContent />
    </AdminPermissionGate>
  );
}

function ProfileContent() {
  const { t } = useTranslation();
  const { dealerId } = useParams({ from: "/admin/dealers/$dealerId" });
  const { tab } = Route.useSearch();
  const navigate = useNavigate();
  const { can } = useAdminPermissions();
  const { formatCurrency, formatNumber } = useFormat();

  const { data: dealer, loading, error, retry } = useAsyncData(
    () => getDealerById(dealerId),
    [dealerId],
  );

  const setTab = (next: ProfileTab) =>
    navigate({ to: "/admin/dealers/$dealerId", params: { dealerId }, search: { tab: next } });

  if (loading && !dealer) return <PageSkeleton rows={8} />;
  if (error && !dealer) return <ErrorState message={error} onRetry={retry} />;
  if (!dealer) return null;

  const city = [dealer.district, dealer.state].filter(Boolean).join(", ") || dealer.location || "—";

  return (
    <div className="space-y-5">
      <Link
        to="/admin/dealers"
        className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        {t("admin.dealers.title")}
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold">{dealer.name}</h1>
          <p className="text-sm text-muted-foreground">
            {dealer.code}
            {dealer.phone ? ` · ${dealer.phone}` : ""}
            {dealer.gstNumber ? ` · GST ${dealer.gstNumber}` : ""}
          </p>
          <p className="text-xs text-muted-foreground">{city}</p>
        </div>
        <Badge variant={dealer.active ? "secondary" : "destructive"}>
          {dealer.active ? t("common.active") : t("common.inactive")}
        </Badge>
      </div>

      {/* Quick navigation */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setTab("orders")}>
          <ShoppingBag className="mr-1 h-4 w-4" />
          {t("admin.dealerProfile.viewOrders")}
        </Button>
        {can("rewards:read") ? (
          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setTab("rewards")}>
            <Gift className="mr-1 h-4 w-4" />
            {t("admin.dealerProfile.viewRewards")}
          </Button>
        ) : null}
        {can("visits:read") ? (
          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setTab("visits")}>
            <MapPin className="mr-1 h-4 w-4" />
            {t("admin.dealerProfile.viewVisits")}
          </Button>
        ) : null}
        {can("reports:read") ? (
          // Reports REUSE the existing engine — deep-link to the reports page pre-scoped to this
          // dealer. No separate reporting engine.
          <Button asChild variant="outline" size="sm" className="rounded-xl">
            <Link to="/admin/reports" search={{ view: "snapshot", dealerId }}>
              <BarChart3 className="mr-1 h-4 w-4" />
              {t("admin.dealerProfile.viewReports")}
            </Link>
          </Button>
        ) : null}
        {dealer.salesExecutiveId && can("dealers:read") ? (
          <Button asChild variant="ghost" size="sm" className="rounded-xl">
            <Link
              to="/admin/sales-executives/$seId"
              params={{ seId: dealer.salesExecutiveId }}
            >
              {t("admin.dealerProfile.viewSalesExec")}
            </Link>
          </Button>
        ) : null}
      </div>

      {/* Summary cards (from the existing dealer DTO — dynamically computed, not stored) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label={t("admin.dealerProfile.totalOrders")} value={formatNumber(dealer.orderCount)} />
        <StatCard label={t("admin.dealerProfile.totalSales")} value={formatCurrency(dealer.totalSales)} />
        <StatCard label={t("admin.dealerProfile.currentPoints")} value={formatNumber(dealer.rewardPoints)} />
        <StatCard label={t("admin.dealerProfile.pendingOrders")} value={formatNumber(dealer.pendingOrders)} />
        <StatCard label={t("admin.dealerProfile.monthSales")} value={formatCurrency(dealer.monthSales)} />
        <StatCard label={t("admin.dealerProfile.openComplaints")} value={formatNumber(dealer.openComplaints)} />
        <StatCard label={t("admin.dealerProfile.lastOrder")} value={dealer.lastOrderDate || "—"} />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as ProfileTab)} className="space-y-4">
        <div className="-mx-1 overflow-x-auto px-1 scrollbar-none">
          <TabsList className="inline-flex w-max min-w-full rounded-2xl">
            <TabsTrigger value="overview">{t("admin.dealerProfile.tabs.overview")}</TabsTrigger>
            <TabsTrigger value="personal">{t("admin.dealerProfile.tabs.personal")}</TabsTrigger>
            <TabsTrigger value="orders">{t("admin.dealerProfile.tabs.orders")}</TabsTrigger>
            {can("rewards:read") ? (
              <TabsTrigger value="rewards">{t("admin.dealerProfile.tabs.rewards")}</TabsTrigger>
            ) : null}
            {can("visits:read") ? (
              <TabsTrigger value="visits">{t("admin.dealerProfile.tabs.visits")}</TabsTrigger>
            ) : null}
          </TabsList>
        </div>

        <TabsContent value="overview">
          <OverviewTab dealer={dealer} dealerId={dealerId} onOpenTab={setTab} />
        </TabsContent>
        <TabsContent value="personal">
          <PersonalTab dealer={dealer} />
        </TabsContent>
        <TabsContent value="orders">
          <OrdersTab dealerId={dealerId} />
        </TabsContent>
        {can("rewards:read") ? (
          <TabsContent value="rewards">
            <RewardsTab dealerId={dealerId} />
          </TabsContent>
        ) : null}
        {can("visits:read") ? (
          <TabsContent value="visits">
            <VisitsTab dealerId={dealerId} />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}

/* ------------------------------- Overview ------------------------------- */

function OverviewTab({
  dealer,
  dealerId,
  onOpenTab,
}: {
  dealer: DistributorDealer;
  dealerId: string;
  onOpenTab: (t: ProfileTab) => void;
}) {
  const { t } = useTranslation();
  const { formatCurrency } = useFormat();
  // 6-month sales trend (reuses the existing per-dealer performance endpoint).
  const { data: perf } = useAsyncData(() => getDealerPerformance(dealerId), [dealerId]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title={t("admin.dealerProfile.tabs.personal")}>
        <DetailRow label={t("admin.dealerProfile.storeName")} value={dealer.name} />
        <DetailRow label={t("admin.dealerProfile.contact")} value={dealer.contactName || "—"} />
        <DetailRow label={t("admin.dealerProfile.mobile")} value={dealer.phone} />
        <DetailRow label={t("admin.dealerProfile.gst")} value={dealer.gstNumber || "—"} />
        <ViewAll onClick={() => onOpenTab("personal")} />
      </Section>

      <Section title={t("admin.dealerProfile.salesSummary")}>
        {(perf ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("admin.dealerProfile.noSales")}</p>
        ) : (
          <ul className="space-y-1.5">
            {(perf ?? []).slice(0, 6).map((row) => (
              <li key={row.month} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{row.month}</span>
                <span className="font-semibold">
                  {formatCurrency(row.orderValue)} · {row.orders}
                </span>
              </li>
            ))}
          </ul>
        )}
        <ViewAll
          label={t("admin.dealerProfile.viewReports")}
          asLink={{ to: "/admin/reports", search: { view: "snapshot", dealerId } }}
        />
      </Section>
    </div>
  );
}

/* ------------------------------- Personal ------------------------------- */

function PersonalTab({ dealer }: { dealer: DistributorDealer }) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title={t("admin.dealerProfile.basicInfo")}>
        <DetailRow label={t("admin.dealerProfile.storeName")} value={dealer.name} />
        <DetailRow label={t("admin.dealerProfile.dealerId")} value={dealer.id} />
        <DetailRow label={t("admin.dealerProfile.code")} value={dealer.code} />
        <DetailRow label={t("admin.dealerProfile.contact")} value={dealer.contactName || "—"} />
        <DetailRow label={t("admin.dealerProfile.mobile")} value={dealer.phone} />
        <DetailRow label={t("admin.dealerProfile.email")} value={dealer.email || "—"} />
      </Section>
      <Section title={t("admin.dealerProfile.businessInfo")}>
        <DetailRow label={t("admin.dealerProfile.gst")} value={dealer.gstNumber || "—"} />
        <DetailRow label={t("admin.dealerProfile.address")} value={dealer.address || "—"} />
        <DetailRow label={t("admin.dealerProfile.area")} value={dealer.area || "—"} />
        <DetailRow label={t("admin.dealerProfile.city")} value={dealer.district || "—"} />
        <DetailRow label={t("admin.dealerProfile.state")} value={dealer.state || "—"} />
        <DetailRow label={t("admin.dealerProfile.pincode")} value={dealer.pincode || "—"} />
      </Section>
    </div>
  );
}

/* -------------------------------- Orders -------------------------------- */

function OrdersTab({ dealerId }: { dealerId: string }) {
  const { t } = useTranslation();
  const { formatCurrency } = useFormat();
  // Reuses GET /api/v1/dealers/:id/orders — the SAME order records, filtered to this dealer.
  const { data, loading, error, retry } = useAsyncData(() => getDealerOrders(dealerId), [dealerId]);

  if (loading && !data) return <PageSkeleton rows={6} />;
  if (error && !data) return <ErrorState message={error} onRetry={retry} />;
  const orders = (data ?? []) as DistributorOrder[];
  if (orders.length === 0) return <EmptyState title={t("admin.dealerProfile.noOrders")} />;

  return (
    <Section title={`${t("admin.dealerProfile.tabs.orders")} (${orders.length})`}>
      <div className="space-y-2">
        {orders.map((order) => {
          const first = order.items[0];
          const sizeThickness = first
            ? [first.size, first.thickness].filter(Boolean).join(" · ")
            : "";
          return (
            <Link
              key={order.id}
              to="/admin/orders/$orderId"
              params={{ orderId: order.id }}
              className="block rounded-2xl bg-secondary/40 px-3 py-2.5 hover:bg-secondary"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{order.id}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {order.placedAt}
                    {first ? ` · ${first.model}` : ""}
                    {sizeThickness ? ` · ${sizeThickness}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <StatusBadge kind="order" status={order.status} />
                  <span className="text-xs font-semibold">{formatCurrency(order.totalValue)}</span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </Section>
  );
}

/* -------------------------------- Rewards ------------------------------- */

function RewardsTab({ dealerId }: { dealerId: string }) {
  const { t } = useTranslation();
  const { formatNumber } = useFormat();
  const { data, loading, error, retry } = useAsyncData(() => getDealerRewards(dealerId), [dealerId]);

  if (loading && !data) return <PageSkeleton rows={6} />;
  if (error && !data) return <ErrorState message={error} onRetry={retry} />;
  if (!data) return null;

  const { summary, ledger, claims } = data;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label={t("admin.dealerProfile.rewards.earned")} value={formatNumber(summary.totalEarned)} />
        <StatCard label={t("admin.dealerProfile.rewards.redeemed")} value={formatNumber(summary.totalRedeemed)} />
        <StatCard label={t("admin.dealerProfile.rewards.available")} value={formatNumber(summary.available)} />
        <StatCard label={t("admin.dealerProfile.rewards.pending")} value={formatNumber(summary.pointsPending)} />
        <StatCard label={t("admin.dealerProfile.rewards.claimed")} value={formatNumber(summary.claimsClaimed)} />
        <StatCard label={t("admin.dealerProfile.rewards.delivered")} value={formatNumber(summary.claimsDelivered)} />
        <StatCard label={t("admin.dealerProfile.rewards.pendingClaims")} value={formatNumber(summary.claimsPending)} />
      </div>

      <Section title={t("admin.dealerProfile.rewards.ledger")}>
        {ledger.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("admin.dealerProfile.rewards.noLedger")}</p>
        ) : (
          <div className="space-y-1.5">
            {ledger.map((row, i) => (
              <div
                key={`${row.occurredAt}-${i}`}
                className="flex items-center justify-between gap-2 rounded-2xl bg-secondary/40 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  {row.orderId ? (
                    <Link
                      to="/admin/orders/$orderId"
                      params={{ orderId: row.orderId }}
                      className="truncate font-semibold text-primary hover:underline"
                    >
                      {row.label}
                    </Link>
                  ) : (
                    <p className="truncate font-semibold">{row.label}</p>
                  )}
                  <p className="text-xs text-muted-foreground">{row.date}</p>
                </div>
                <div className="shrink-0 text-right">
                  <span
                    className={
                      row.delta >= 0 ? "font-semibold text-emerald-600" : "font-semibold text-rose-600"
                    }
                  >
                    {row.delta >= 0 ? "+" : "−"}
                    {formatNumber(Math.abs(row.delta))}
                  </span>
                  <p className="text-xs text-muted-foreground">
                    {t("admin.dealerProfile.rewards.balance")}: {formatNumber(row.balanceAfter)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title={`${t("admin.dealerProfile.rewards.claims")} (${claims.length})`}>
        {claims.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("admin.dealerProfile.rewards.noClaims")}</p>
        ) : (
          <div className="space-y-2">
            {claims.map((claim) => (
              <div
                key={claim.id}
                className="flex items-center justify-between gap-2 rounded-2xl bg-secondary/40 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {claim.emoji} {claim.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {claim.claimedAt}
                    {claim.deliveredAt ? ` → ${claim.deliveredAt}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge variant="outline" className="capitalize">
                    {claim.status}
                  </Badge>
                  <span className="text-xs font-semibold">
                    −{formatNumber(claim.points)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

/* -------------------------------- Visits -------------------------------- */

function formatDuration(minutes?: number) {
  if (minutes == null) return "—";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function VisitsTab({ dealerId }: { dealerId: string }) {
  const { t } = useTranslation();
  const { can } = useAdminPermissions();
  // Reuses the admin visits list, now dealer-filterable.
  const { data, loading, error, retry } = useAsyncData(
    () => listAdminVisits({ dealerId, status: "all", pageSize: 50 }),
    [dealerId],
  );

  if (loading && !data) return <PageSkeleton rows={6} />;
  if (error && !data) return <ErrorState message={error} onRetry={retry} />;
  if (!data) return null;
  if (data.total === 0) return <EmptyState title={t("distributor.visits.noVisitsYet")} />;

  return (
    <Section title={`${t("admin.dealerProfile.tabs.visits")} (${data.total})`}>
      <div className="space-y-2">
        {data.items.map((v) => {
          const seLinkable = Boolean(v.salesExecutiveName && v.salesExecutiveUserId && can("dealers:read"));
          return (
            // Plain container (NOT an outer link) so the SE name and the "View visit" link can each
            // be independent anchors — nesting <a> inside <a> is invalid HTML.
            <div key={v.id} className="rounded-2xl bg-secondary/40 px-3 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {seLinkable ? (
                    <Link
                      to="/admin/sales-executives/$seId"
                      params={{ seId: v.salesExecutiveUserId! }}
                      className="truncate text-sm font-semibold text-primary hover:underline"
                    >
                      {v.salesExecutiveName}
                    </Link>
                  ) : (
                    <p className="truncate text-sm font-semibold">{v.salesExecutiveName ?? "—"}</p>
                  )}
                  <p className="truncate text-xs text-muted-foreground">
                    {v.checkInAt}
                    {v.checkOutAt ? ` → ${v.checkOutAt}` : ""} · {formatDuration(v.durationMinutes)}
                  </p>
                  {v.notes ? <p className="mt-0.5 truncate text-xs">{v.notes}</p> : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <StatusBadge kind="visit" status={v.status} />
                  <Link
                    to="/admin/visits/$visitId"
                    params={{ visitId: v.id }}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    {t("admin.dealerProfile.viewVisit")}
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

/* ------------------------------- Primitives ----------------------------- */

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-3 py-2.5 text-center shadow-soft">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-display text-lg font-bold">{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-border bg-card p-4 shadow-soft">
      <h2 className="mb-3 font-display font-bold">{title}</h2>
      {children}
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-right font-medium">{value}</span>
    </div>
  );
}

function ViewAll({
  onClick,
  label,
  asLink,
}: {
  onClick?: () => void;
  label?: string;
  asLink?: { to: string; search?: Record<string, unknown> };
}) {
  const { t } = useTranslation();
  const text = label ?? t("common.viewAll");
  if (asLink) {
    return (
      <Button asChild variant="link" size="sm" className="mt-2 h-auto px-0">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <Link to={asLink.to as any} search={asLink.search as any}>
          {text}
        </Link>
      </Button>
    );
  }
  return (
    <Button variant="link" size="sm" className="mt-2 h-auto px-0" onClick={onClick}>
      {text}
    </Button>
  );
}
