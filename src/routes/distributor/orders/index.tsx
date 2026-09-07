import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { DistributorShell } from "@/components/distributor-shell";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import { ListPagination } from "@/components/shared/list-pagination";
import { OrderCard } from "@/components/shared/order-card";
import { SearchBar } from "@/components/shared/search-bar";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/shared/states";
import { useAsyncData } from "@/hooks/use-async-data";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  getOrderStatusCounts,
  listOrdersPage,
  type OrderStatusTab,
} from "@/services/orders";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/distributor/orders/")({
  component: OrdersPage,
});

type Period = "today" | "week" | "month" | "all" | "custom";

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

  if (period === "today") {
    return { fromDate: toDate, toDate };
  }

  if (period === "week") {
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 7);
    return { fromDate: weekAgo.toISOString().slice(0, 10), toDate };
  }

  const monthAgo = new Date(now);
  monthAgo.setMonth(now.getMonth() - 1);
  return { fromDate: monthAgo.toISOString().slice(0, 10), toDate };
}

function OrdersPage() {
  const { t } = useTranslation();
  const [statusTab, setStatusTab] = useState<OrderStatusTab>("pending");
  const [period, setPeriod] = useState<Period>("month");
  const [customRange, setCustomRange] = useState(defaultCustomRange);
  const [searchInput, setSearchInput] = useState("");
  const search = useDebouncedValue(searchInput, 350);
  const [page, setPage] = useState(1);
  const simulateError =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("error") === "1";

  const dateRange = periodToDateRange(period, customRange);

  // Count the same date window as the list so the tab badges match what's shown (e.g. "Today"
  // counts today's pending, not all-time). Re-runs when the period / custom range changes.
  const countsQuery = useAsyncData(
    () => getOrderStatusCounts({ fromDate: dateRange.fromDate, toDate: dateRange.toDate }),
    [period, customRange.from, customRange.to],
  );

  const { data, loading, error, retry } = useAsyncData(
    () => {
      if (simulateError) throw new Error(t("errors.failedToLoadOrders"));
      return listOrdersPage({
        status: statusTab !== "all" ? statusTab : undefined,
        search: search || undefined,
        fromDate: dateRange.fromDate,
        toDate: dateRange.toDate,
        page,
        pageSize: 20,
      });
    },
    [statusTab, search, period, customRange.from, customRange.to, page, simulateError, t],
  );

  const counts = countsQuery.data;

  return (
    <DistributorShell title={t("distributor.orders.title")}>
      <SearchBar
        value={searchInput}
        onChange={(value) => {
          setSearchInput(value);
          setPage(1);
        }}
        placeholder={t("distributor.orders.searchPlaceholder")}
      />

      <div className="mt-4 flex flex-wrap gap-2">
        {(
          [
            ["today", t("common.today")],
            ["week", t("common.thisWeek")],
            ["month", t("common.thisMonth")],
            ["all", t("common.allTime")],
            ["custom", t("common.custom")],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setPeriod(id);
              setPage(1);
              if (id === "custom" && !customRange.from) setCustomRange(defaultCustomRange());
            }}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm font-bold",
              period === id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {period === "custom" && (
        <DateRangePicker
          className="mt-3"
          fromDate={customRange.from}
          toDate={customRange.to}
          onChange={(from, to) => {
            setCustomRange({ from, to });
            setPage(1);
          }}
        />
      )}

      <div className="mt-4 flex gap-1 overflow-x-auto rounded-xl bg-secondary p-1">
        {STATUS_TAB_ORDER.map((tabId) => (
          <button
            key={tabId}
            type="button"
            onClick={() => {
              setStatusTab(tabId);
              setPage(1);
            }}
            className={cn(
              "press shrink-0 rounded-lg px-3 py-2 text-sm font-bold",
              statusTab === tabId ? "bg-card shadow-soft" : "text-muted-foreground",
            )}
          >
            {t(STATUS_TAB_KEYS[tabId])}
            {counts && tabId !== "all" ? ` (${counts[tabId]})` : counts && tabId === "all" ? ` (${counts.all})` : ""}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {loading && <PageSkeleton />}
        {error && <ErrorState message={error} onRetry={retry} />}
        {!loading && !error && (data?.items.length ?? 0) === 0 && (
          <EmptyState
            title={
              search
                ? t("common.noOrdersSearch")
                : statusTab === "pending"
                  ? t("distributor.dashboard.noPendingOrders")
                  : t("distributor.orders.noOrders")
            }
            description={
              search ? t("common.noMatchingResults") : t("distributor.orders.noOrdersDesc")
            }
          />
        )}
        {!loading && !error && (data?.items.length ?? 0) > 0 && (
          <div className="space-y-3">
            {data?.items.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        )}
        {!loading && !error && data && (
          <ListPagination
            page={data.page}
            totalPages={data.totalPages}
            onPageChange={setPage}
          />
        )}
      </div>
    </DistributorShell>
  );
}
