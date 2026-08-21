import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { DistributorShell } from "@/components/distributor-shell";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import { ListPagination } from "@/components/shared/list-pagination";
import { OrderCard } from "@/components/shared/order-card";
import { SearchBar } from "@/components/shared/search-bar";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/shared/states";
import { useAsyncData } from "@/hooks/use-async-data";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { listOrdersPage } from "@/services/orders";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/distributor/orders/")({
  component: OrdersPage,
});

type Tab = "pending" | "all";
type Period = "today" | "week" | "month" | "all" | "custom";

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
  const [tab, setTab] = useState<Tab>("pending");
  const [period, setPeriod] = useState<Period>("month");
  const [customRange, setCustomRange] = useState(defaultCustomRange);
  const [searchInput, setSearchInput] = useState("");
  const search = useDebouncedValue(searchInput, 350);
  const [page, setPage] = useState(1);
  const simulateError =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("error") === "1";

  const dateRange = periodToDateRange(period, customRange);

  const { data, loading, error, retry } = useAsyncData(
    () => {
      if (simulateError) throw new Error("Failed to load orders");
      return listOrdersPage({
        status: tab === "pending" ? "order_placed" : undefined,
        search: search || undefined,
        fromDate: dateRange.fromDate,
        toDate: dateRange.toDate,
        page,
        pageSize: 20,
      });
    },
    [tab, search, period, customRange.from, customRange.to, page, simulateError],
  );

  return (
    <DistributorShell title="Orders">
      <SearchBar
        value={searchInput}
        onChange={(value) => {
          setSearchInput(value);
          setPage(1);
        }}
        placeholder="Search by Order ID, store or dealer name…"
      />

      <div className="mt-4 flex flex-wrap gap-2">
        {([
          ["today", "Today"],
          ["week", "This week"],
          ["month", "This month"],
          ["all", "All time"],
          ["custom", "Custom"],
        ] as const).map(([id, label]) => (
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

      <div className="mt-4 flex gap-2 rounded-xl bg-secondary p-1">
        {(["pending", "all"] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              setPage(1);
            }}
            className={cn(
              "press flex-1 rounded-xl py-2.5 text-sm font-bold capitalize",
              tab === t ? "bg-card shadow-soft" : "text-muted-foreground",
            )}
          >
            {t === "pending" ? "Pending Approval" : "All Orders"}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {loading && <PageSkeleton />}
        {error && <ErrorState message={error} onRetry={retry} />}
        {!loading && !error && (data?.items.length ?? 0) === 0 && (
          <EmptyState
            title={search ? "No matching orders" : tab === "pending" ? "No pending orders" : "No orders yet"}
            description={
              search
                ? "Try a different Order ID, store name, or dealer name."
                : "Orders from your dealers will appear here."
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
