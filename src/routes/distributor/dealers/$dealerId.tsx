import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { MapPin, Phone, Mail } from "lucide-react";
import { DistributorShell } from "@/components/distributor-shell";
import { StatusBadge } from "@/components/shared/status-badge";
import { OrderCard } from "@/components/shared/order-card";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { useAsyncData } from "@/hooks/use-async-data";
import { useFormat } from "@/hooks/use-format";
import { getDealerById, getDealerPerformance, getDealerRewardClaims } from "@/services/dealers";
import { getOrdersByDealer } from "@/services/orders";
import { getComplaintsByDealer } from "@/services/complaints";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/distributor/dealers/$dealerId")({
  validateSearch: (s: Record<string, unknown>) => ({
    tab: typeof s.tab === "string" ? s.tab : undefined,
  }),
  component: DealerDetailPage,
});

const TAB_IDS = ["overview", "performance", "orders", "complaints", "rewards", "activity"] as const;
type Tab = (typeof TAB_IDS)[number];

const LEGACY_TAB_MAP: Record<string, Tab> = {
  Overview: "overview",
  Performance: "performance",
  Orders: "orders",
  Complaints: "complaints",
  Rewards: "rewards",
  Activity: "activity",
};

function resolveTab(tabSearch?: string): Tab {
  if (!tabSearch) return "overview";
  if (TAB_IDS.includes(tabSearch as Tab)) return tabSearch as Tab;
  return LEGACY_TAB_MAP[tabSearch] ?? "overview";
}

function DealerDetailPage() {
  const { t } = useTranslation();
  const { formatCurrency, formatNumber } = useFormat();
  const { dealerId } = Route.useParams();
  const { tab: tabSearch } = Route.useSearch();
  const [tab, setTab] = useState<Tab>(() => resolveTab(tabSearch));
  const [rewardsTab, setRewardsTab] = useState<"pending" | "delivered">("pending");

  const tabLabels = useMemo(
    (): Record<Tab, string> => ({
      overview: t("distributor.orderDetail.dealerInfo"),
      performance: t("distributor.reports.dealerPerformance"),
      orders: t("nav.distributor.orders"),
      complaints: t("nav.distributor.complaints"),
      rewards: t("nav.distributor.rewards"),
      activity: t("common.status"),
    }),
    [t],
  );

  const dealerQuery = useAsyncData(() => getDealerById(dealerId), [dealerId]);
  const ordersQuery = useAsyncData(() => getOrdersByDealer(dealerId), [dealerId]);
  const complaintsQuery = useAsyncData(() => getComplaintsByDealer(dealerId), [dealerId]);
  const rewardsQuery = useAsyncData(() => getDealerRewardClaims(dealerId), [dealerId]);
  const performanceQuery = useAsyncData(() => getDealerPerformance(dealerId), [dealerId]);

  const loading = dealerQuery.loading;
  const dealer = dealerQuery.data;

  if (loading) {
    return (
      <DistributorShell title={t("common.dealer")} back="/distributor/dealers">
        <PageSkeleton rows={4} />
      </DistributorShell>
    );
  }

  if (dealerQuery.error || !dealer) {
    return (
      <DistributorShell title={t("common.dealer")} back="/distributor/dealers">
        <ErrorState message={dealerQuery.error ?? t("errors.notFound")} onRetry={dealerQuery.retry} />
      </DistributorShell>
    );
  }

  return (
    <DistributorShell title={dealer.name} back="/distributor/dealers" showBell={false}>
      <div className="animate-rise">
        <p className="text-sm font-semibold text-muted-foreground">{dealer.code}</p>
        <p className="mt-2 flex items-center gap-1 text-sm text-muted-foreground">
          <MapPin className="h-4 w-4" /> {dealer.location}
        </p>
        <p className="mt-1 flex items-center gap-1 text-sm">
          <Phone className="h-4 w-4 text-muted-foreground" /> {dealer.phone}
        </p>
        <p className="mt-1 flex items-center gap-1 text-sm">
          <Mail className="h-4 w-4 text-muted-foreground" /> {dealer.email}
        </p>
        {dealer.gstNumber && (
          <p className="mt-3 rounded-2xl border border-border bg-secondary/50 px-3 py-2 text-sm">
            <span className="text-muted-foreground">{t("common.gst")}: </span>
            <span className="font-bold">{dealer.gstNumber}</span>
          </p>
        )}
      </div>

      <div className="scrollbar-none mt-4 flex snap-x gap-2 overflow-x-auto scroll-smooth-touch pb-1">
        {TAB_IDS.map((id) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "press shrink-0 rounded-full px-4 py-2 text-sm font-semibold",
              tab === id
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground",
            )}
          >
            {tabLabels[id]}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "overview" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">{t("distributor.reports.periodTotalSales")}</p>
                <p className="font-display text-lg font-bold">{formatCurrency(dealer.totalSales)}</p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">{t("distributor.dashboard.monthlySales")}</p>
                <p className="font-display text-lg font-bold">{formatCurrency(dealer.monthSales)}</p>
                <p
                  className={cn(
                    "text-xs font-semibold",
                    dealer.salesGrowth >= 0 ? "text-success" : "text-destructive",
                  )}
                >
                  {t("distributor.dashboard.salesGrowthVsLastMonth", {
                    sign: dealer.salesGrowth >= 0 ? "+" : "",
                    percent: Math.abs(dealer.salesGrowth),
                  })}
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">{t("common.orders")}</p>
                <p className="font-display text-lg font-bold">{dealer.orderCount}</p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">{t("distributor.orderDetail.pointsLabel")}</p>
                <p className="font-display text-lg font-bold">{formatNumber(dealer.rewardPoints)}</p>
              </div>
            </div>
            {performanceQuery.data && performanceQuery.data.length > 0 && (
              <div className="rounded-3xl border border-border bg-card p-4">
                <p className="font-display font-bold">{t("distributor.dashboard.salesTrend")}</p>
                <div className="mt-3 space-y-2">
                  {performanceQuery.data.map((row) => (
                    <div
                      key={row.month}
                      className="flex items-center justify-between rounded-2xl bg-secondary/60 px-3 py-2.5 text-sm"
                    >
                      <span className="font-semibold">{row.month}</span>
                      <div className="text-right">
                        <p className="font-bold">
                          {formatNumber(row.orders)} {t("common.orders")}
                        </p>
                        <p className="text-xs text-muted-foreground">{formatCurrency(row.orderValue)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "performance" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">{t("common.orders")}</p>
                <p className="font-display text-lg font-bold">{dealer.orderCount}</p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">{t("distributor.orderDetail.valueLabel")}</p>
                <p className="font-display text-lg font-bold">{formatCurrency(dealer.totalSales)}</p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">{t("distributor.orderDetail.pointsLabel")}</p>
                <p className="font-display text-lg font-bold text-primary">
                  {formatNumber(dealer.rewardPoints)}
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">{t("common.placedOn")}</p>
                <p className="font-display text-sm font-bold">{dealer.lastOrderDate}</p>
              </div>
            </div>

            <div className="rounded-3xl border border-border bg-card p-4">
              <p className="font-display font-bold">{t("common.monthlyPerformance")}</p>
              <div className="mt-3 space-y-2">
                {(performanceQuery.data ?? dealer.monthlyPerformance ?? []).map((row) => (
                  <div
                    key={row.month}
                    className="flex items-center justify-between rounded-2xl bg-secondary/60 px-3 py-2.5 text-sm"
                  >
                    <span className="font-semibold">{row.month}</span>
                    <div className="text-right">
                      <p className="font-bold">
                        {formatNumber(row.orders)} {t("common.orders")}
                      </p>
                      <p className="text-xs text-muted-foreground">{formatCurrency(row.orderValue)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "orders" && (
          <div className="space-y-3">
            {ordersQuery.loading && <PageSkeleton />}
            {ordersQuery.data?.map((o) => (
              <OrderCard key={o.id} order={o} />
            ))}
            {!ordersQuery.loading && ordersQuery.data?.length === 0 && (
              <p className="text-center text-sm text-muted-foreground">
                {t("distributor.orders.noOrdersDesc")}
              </p>
            )}
          </div>
        )}

        {tab === "complaints" && (
          <div className="space-y-3">
            {complaintsQuery.data?.map((c) => (
              <Link
                key={c.id}
                to="/distributor/complaints/$complaintId"
                params={{ complaintId: c.id }}
                className="press block rounded-2xl border border-border bg-card p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">{c.id}</p>
                  <StatusBadge kind="complaint" status={c.status} />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{c.category}</p>
                <p className="mt-2 line-clamp-2 text-sm">{c.description}</p>
              </Link>
            ))}
            {!complaintsQuery.loading && complaintsQuery.data?.length === 0 && (
              <p className="text-center text-sm text-muted-foreground">
                {t("distributor.complaints.noComplaints")}
              </p>
            )}
          </div>
        )}

        {tab === "rewards" && (
          <div className="space-y-4">
            <div className="rounded-3xl border border-border bg-card p-5 text-center">
              <p className="font-display text-3xl font-bold text-primary">
                {formatNumber(dealer.rewardPoints)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{t("common.totalRewardPoints")}</p>
            </div>

            <div className="flex gap-2 rounded-2xl bg-secondary p-1">
              {(["pending", "delivered"] as const).map((rewardsTabId) => (
                <button
                  key={rewardsTabId}
                  onClick={() => setRewardsTab(rewardsTabId)}
                  className={cn(
                    "press flex-1 rounded-xl py-2.5 text-sm font-bold capitalize",
                    rewardsTab === rewardsTabId ? "bg-card shadow-soft" : "text-muted-foreground",
                  )}
                >
                  {rewardsTabId === "pending" ? t("common.pending") : t("common.delivered")}
                </button>
              ))}
            </div>

            {rewardsQuery.loading && <PageSkeleton rows={2} />}
            {!rewardsQuery.loading &&
              (rewardsQuery.data?.filter((c) => c.status === rewardsTab).length ?? 0) === 0 && (
                <p className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
                  {rewardsTab === "pending" ? t("common.noPendingRewards") : t("common.noDeliveredRewards")}
                </p>
              )}
            <div className="space-y-3">
              {rewardsQuery.data
                ?.filter((c) => c.status === rewardsTab)
                .map((claim) => (
                  <div
                    key={claim.id}
                    className="rounded-2xl border border-border bg-card p-4 shadow-soft"
                  >
                    <div className="flex items-start gap-3">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-secondary text-xl">
                        {claim.emoji}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold">{claim.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatNumber(claim.points)} {t("common.points")} · {t("common.claimed")}{" "}
                          {claim.claimedAt}
                        </p>
                        <p
                          className={cn(
                            "mt-1 text-sm font-semibold",
                            claim.status === "delivered" ? "text-success" : "text-amber-700",
                          )}
                        >
                          {claim.status === "delivered"
                            ? t("common.statusDelivered")
                            : t("common.statusPendingReward")}
                        </p>
                        {claim.deliveredAt && (
                          <p className="text-xs text-muted-foreground">
                            {t("common.delivered")} {claim.deliveredAt}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {tab === "activity" && (
          <div className="rounded-2xl border border-border bg-card p-4 text-sm">
            <p>
              <span className="text-muted-foreground">{t("common.placedOn")}:</span>{" "}
              <span className="font-semibold">{dealer.lastOrderDate}</span>
            </p>
            <p className="mt-2">
              <span className="text-muted-foreground">{t("distributor.dashboard.openComplaints")}:</span>{" "}
              <span className="font-semibold">{dealer.openComplaints}</span>
            </p>
            <p className="mt-2">
              <span className="text-muted-foreground">{t("common.status")}:</span>{" "}
              <span className="font-semibold">
                {dealer.active ? t("common.active") : t("common.inactive")}
              </span>
            </p>
          </div>
        )}
      </div>
    </DistributorShell>
  );
}
