import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/app-shell";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import { OrderHelpPanel } from "@/components/shared/order-help-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { ListPagination } from "@/components/shared/list-pagination";
import { SearchBar } from "@/components/shared/search-bar";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { useAsyncData } from "@/hooks/use-async-data";
import { useFormat } from "@/hooks/use-format";
import { requireRoles } from "@/lib/auth-guard";
import type { OrderStatus } from "@/lib/mock/distributor/types";
import { cn } from "@/lib/utils";
import { listDealerOrdersPage, getOrderStatusCounts, type OrderStatusTab } from "@/services/orders";
import i18n from "@/lib/i18n";

export const Route = createFileRoute("/orders")({
  beforeLoad: () => requireRoles(["dealer"]),
  head: () => ({
    meta: [
      { title: i18n.t("dealer.meta.ordersTitle") },
      {
        name: "description",
        content: i18n.t("dealer.meta.ordersDescription"),
      },
      { property: "og:title", content: i18n.t("dealer.meta.ordersTitle") },
      { property: "og:description", content: i18n.t("dealer.meta.ordersDescription") },
    ],
  }),
  component: Orders,
});

type Period = "week" | "month" | "quarter" | "year" | "all" | "custom";

const STATUS_TAB_KEYS: Record<OrderStatusTab, string> = {
  pending: "dealer.orders.statusTabs.pending",
  approved: "dealer.orders.statusTabs.approved",
  in_making: "dealer.orders.statusTabs.inMaking",
  out_for_delivery: "dealer.orders.statusTabs.outForDelivery",
  delivered: "dealer.orders.statusTabs.delivered",
  rejected: "dealer.orders.statusTabs.rejected",
  cancelled: "dealer.orders.statusTabs.cancelled",
  all: "dealer.orders.statusTabs.all",
};

const STATUS_TAB_ORDER: OrderStatusTab[] = [
  "pending",
  "approved",
  "in_making",
  "out_for_delivery",
  "delivered",
  "rejected",
  "cancelled",
  "all",
];

const PERIOD_KEYS: Record<Period, string> = {
  week: "common.thisWeek",
  month: "common.thisMonth",
  quarter: "common.thisQuarter",
  year: "common.thisYear",
  all: "common.allTime",
  custom: "common.custom",
};

function defaultCustomRange() {
  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - 1);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

function periodToDateRange(
  period: Period,
  customRange: { from: string; to: string },
): { fromDate?: string; toDate?: string } {
  if (period === "all") return {};
  if (period === "custom") {
    return { fromDate: customRange.from, toDate: customRange.to };
  }
  const now = new Date();
  const toDate = now.toISOString().slice(0, 10);
  const start = new Date(now);
  if (period === "week") start.setDate(now.getDate() - 7);
  if (period === "month") start.setMonth(now.getMonth() - 1);
  if (period === "quarter") start.setMonth(now.getMonth() - 3);
  if (period === "year") start.setFullYear(now.getFullYear() - 1);
  return { fromDate: start.toISOString().slice(0, 10), toDate };
}

function Orders() {
  const { t } = useTranslation();
  const { formatCurrency, formatNumber } = useFormat();
  const [helpOrderId, setHelpOrderId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusTab, setStatusTab] = useState<OrderStatusTab>("all");
  const [period, setPeriod] = useState<Period>("month");
  const [customRange, setCustomRange] = useState(defaultCustomRange);
  const [page, setPage] = useState(1);

  const { data: statusCounts } = useAsyncData(() => getOrderStatusCounts(), []);

  const dateRange = periodToDateRange(period, customRange);

  const { data, loading, error, retry } = useAsyncData(
    () =>
      listDealerOrdersPage({
        page,
        pageSize: 20,
        search: search.trim() || undefined,
        status: statusTab,
        fromDate: dateRange.fromDate,
        toDate: dateRange.toDate,
      }),
    [search, statusTab, period, customRange.from, customRange.to, page],
  );

  const orders = data?.items ?? [];
  const totalSales = data?.summary.totalSales ?? 0;
  const totalPoints = data?.summary.totalPoints ?? 0;

  return (
    <AppShell title={t("dealer.orders.title")}>
      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_TAB_ORDER.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setStatusTab(id);
              setPage(1);
              if (id === "rejected") setPeriod("all");
            }}
            className={cn(
              "rounded-lg border px-2.5 py-1.5 text-xs font-bold",
              statusTab === id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card",
            )}
          >
            {t(STATUS_TAB_KEYS[id])}
            {statusCounts
              ? ` (${id === "all" ? statusCounts.all : statusCounts[id]})`
              : ""}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {(Object.keys(PERIOD_KEYS) as Period[]).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setPeriod(id);
              setPage(1);
              if (id === "custom" && !customRange.from) setCustomRange(defaultCustomRange());
            }}
            className={cn(
              "rounded-lg border px-2.5 py-1.5 text-xs font-bold",
              period === id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card",
            )}
          >
            {t(PERIOD_KEYS[id])}
          </button>
        ))}
      </div>

      {period === "custom" && (
        <DateRangePicker
          className="mb-4"
          fromDate={customRange.from}
          toDate={customRange.to}
          onChange={(from, to) => {
            setCustomRange({ from, to });
            setPage(1);
          }}
        />
      )}

      {!loading && !error && (
        <div className="mb-4 grid grid-cols-1 gap-2 text-center text-sm min-[420px]:grid-cols-3">
          <div className="min-w-0 rounded-xl border border-border bg-card p-3 shadow-soft">
            <p className="text-xs text-muted-foreground">{t("dealer.orders.ordersCount")}</p>
            <p className="font-display text-lg font-bold tabular-nums">{data?.total ?? 0}</p>
          </div>
          <div className="min-w-0 rounded-xl border border-border bg-card p-3 shadow-soft">
            <p className="text-xs text-muted-foreground">{t("dealer.orders.sales")}</p>
            <p
              className="font-display text-base font-bold tabular-nums leading-tight min-[420px]:text-lg"
              title={formatCurrency(totalSales)}
            >
              {formatCurrency(totalSales)}
            </p>
          </div>
          <div className="min-w-0 rounded-xl border border-border bg-card p-3 shadow-soft">
            <p className="text-xs text-muted-foreground">{t("dealer.orders.rewardPointsLabel")}</p>
            <p className="font-display text-base font-bold tabular-nums text-primary min-[420px]:text-lg">
              {formatNumber(totalPoints)}
            </p>
          </div>
        </div>
      )}

      <SearchBar
        value={search}
        onChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        placeholder={t("common.searchOrders")}
      />

      <div className="mb-4 mt-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{t("common.tapOrderForDetails")}</p>
        <Link to="/complaints" className="text-sm font-bold text-primary">
          {t("nav.dealer.complaints")}
        </Link>
      </div>

      {loading && <PageSkeleton rows={4} />}
      {error && <ErrorState message={error} onRetry={retry} />}

      {!loading && !error && orders.length === 0 && (
        <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          {search.trim()
            ? t("common.noOrdersSearch")
            : statusTab === "rejected"
              ? t("dealer.orders.noRejectedOrders")
              : t("common.noOrdersPeriod")}
        </p>
      )}

      {!loading && !error && orders.length > 0 && (
        <div className="space-y-3">
          {orders.map((o, i) => {
            const helpOpen = helpOrderId === o.id;
            const isRejected = o.rawStatus === "rejected";
            return (
              <div
                key={o.id}
                className={cn(
                  "animate-rise rounded-xl border bg-card shadow-soft",
                  isRejected ? "border-destructive/30" : "border-border",
                )}
                style={{ animationDelay: `${i * 70}ms` }}
              >
                <Link
                  to="/orders/$orderId"
                  params={{ orderId: o.id }}
                  className="press block p-5"
                >
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-lg font-bold">
                        {t("common.orderHash", { orderId: o.id })}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t("common.placedOn")} {o.placed}
                      </p>
                      <p className="mt-3 text-base font-bold break-words">{o.product}</p>
                      <p className="text-sm text-muted-foreground break-words">{o.detail}</p>
                      <p
                        className="mt-2 font-display text-lg font-bold tabular-nums sm:text-xl"
                        title={formatCurrency(o.amount)}
                      >
                        {formatCurrency(o.amount)}
                      </p>
                      {(o.rewardPoints ?? 0) > 0 && (
                        <p className="mt-1 text-sm font-semibold text-primary tabular-nums">
                          +{formatNumber(o.rewardPoints)}{" "}
                          {t("common.rewardPoints")}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <StatusBadge kind="order" status={o.rawStatus as OrderStatus} />
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </div>
                </Link>

                <div className="border-t border-border px-5 pb-5 pt-3">
                  <button
                    type="button"
                    onClick={() => setHelpOrderId(helpOpen ? null : o.id)}
                    className={cn(
                      "press flex h-11 w-full items-center justify-center rounded-2xl text-sm font-bold",
                      helpOpen
                        ? "border border-primary bg-secondary text-primary"
                        : "border border-border bg-background text-foreground",
                    )}
                  >
                    {helpOpen ? t("common.closeHelp") : t("common.needHelp")}
                  </button>
                  {helpOpen && <OrderHelpPanel order={o} />}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && !error && data && (
        <ListPagination page={data.page} totalPages={data.totalPages} onPageChange={setPage} />
      )}
    </AppShell>
  );
}
