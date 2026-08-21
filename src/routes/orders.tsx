import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { DateRangePicker, inDateRange } from "@/components/shared/date-range-picker";
import { OrderHelpPanel } from "@/components/shared/order-help-panel";
import { SearchBar } from "@/components/shared/search-bar";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { useAsyncData } from "@/hooks/use-async-data";
import { requireRoles } from "@/lib/auth-guard";
import { cn } from "@/lib/utils";
import { inr, orderSteps } from "@/lib/demo-data";
import { listDealerOrdersPage } from "@/services/orders";

export const Route = createFileRoute("/orders")({
  beforeLoad: () => requireRoles(["dealer"]),
  head: () => ({
    meta: [
      { title: "Track Orders — BackRest Dealer App" },
      {
        name: "description",
        content: "See every BackRest order, track progress, and get help without typing order numbers.",
      },
      { property: "og:title", content: "Track Orders — BackRest Dealer App" },
      { property: "og:description", content: "A simple, visual timeline for each dealer order." },
    ],
  }),
  component: Orders,
});

type Period = "week" | "month" | "quarter" | "year" | "all" | "custom";

function defaultCustomRange() {
  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - 1);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

function inPeriod(dateLabel: string, period: Period, fromDate?: string, toDate?: string) {
  if (period === "custom") return inDateRange(dateLabel, fromDate, toDate);
  if (period === "all") return true;
  const d = new Date(dateLabel);
  if (Number.isNaN(d.getTime())) return true;
  const now = new Date();
  const start = new Date(now);
  if (period === "week") start.setDate(now.getDate() - 7);
  if (period === "month") start.setMonth(now.getMonth() - 1);
  if (period === "quarter") start.setMonth(now.getMonth() - 3);
  if (period === "year") start.setFullYear(now.getFullYear() - 1);
  return d >= start;
}

function Orders() {
  const [helpOrderId, setHelpOrderId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<Period>("month");
  const [customRange, setCustomRange] = useState(defaultCustomRange);

  const { data, loading, error, retry } = useAsyncData(
    () => listDealerOrdersPage({ page: 1, pageSize: 50, search: search.trim() || undefined }),
    [search],
  );

  const filteredOrders = useMemo(() => {
    const items = data?.items ?? [];
    return items.filter((o) => inPeriod(o.placed, period, customRange.from, customRange.to));
  }, [data, period, customRange.from, customRange.to]);

  const totalSales = filteredOrders.reduce((s, o) => s + o.amount, 0);
  const totalPoints = filteredOrders.reduce((s, o) => s + (o.rewardPoints ?? 0), 0);

  return (
    <AppShell title="My Orders">
      <div className="mb-4 flex flex-wrap gap-2">
        {([
          ["week", "This week"],
          ["month", "This month"],
          ["quarter", "This quarter"],
          ["year", "This year"],
          ["all", "All time"],
          ["custom", "Custom"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setPeriod(id);
              if (id === "custom" && !customRange.from) setCustomRange(defaultCustomRange());
            }}
            className={cn(
              "rounded-lg border px-2.5 py-1.5 text-xs font-bold",
              period === id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {period === "custom" && (
        <DateRangePicker
          className="mb-4"
          fromDate={customRange.from}
          toDate={customRange.to}
          onChange={(from, to) => setCustomRange({ from, to })}
        />
      )}

      {!loading && !error && (
        <div className="mb-4 grid grid-cols-3 gap-2 text-center text-sm">
          <div className="rounded-xl border border-border bg-card p-3 shadow-soft">
            <p className="text-xs text-muted-foreground">Orders</p>
            <p className="font-display text-lg font-bold">{filteredOrders.length}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 shadow-soft">
            <p className="text-xs text-muted-foreground">Sales</p>
            <p className="font-display text-lg font-bold">{inr(totalSales)}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 shadow-soft">
            <p className="text-xs text-muted-foreground">Reward pts</p>
            <p className="font-display text-lg font-bold text-primary">{totalPoints.toLocaleString("en-IN")}</p>
          </div>
        </div>
      )}

      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search by order ID or product…"
      />

      <div className="mb-4 mt-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Tap an order for full details</p>
        <Link to="/complaints" className="text-sm font-bold text-primary">
          Help requests
        </Link>
      </div>

      {loading && <PageSkeleton rows={4} />}
      {error && <ErrorState message={error} onRetry={retry} />}

      {!loading && !error && filteredOrders.length === 0 && (
        <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          {search.trim()
            ? "No orders match your search."
            : "No orders in this period. Place an order from Products."}
        </p>
      )}

      {!loading && !error && filteredOrders.length > 0 && (
        <div className="space-y-3">
          {filteredOrders.map((o, i) => {
            const helpOpen = helpOrderId === o.id;
            return (
              <div
                key={o.id}
                className="animate-rise rounded-xl border border-border bg-card shadow-soft"
                style={{ animationDelay: `${i * 70}ms` }}
              >
                <Link
                  to="/orders/$orderId"
                  params={{ orderId: o.id }}
                  className="press block p-5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-lg font-bold">Order #{o.id}</p>
                      <p className="mt-1 text-sm text-muted-foreground">Placed {o.placed}</p>
                      <p className="mt-3 text-base font-bold">{o.product}</p>
                      <p className="text-sm text-muted-foreground">{o.detail}</p>
                      <p className="mt-2 font-display text-xl font-bold">{inr(o.amount)}</p>
                      {(o.rewardPoints ?? 0) > 0 && (
                        <p className="mt-1 text-sm font-semibold text-primary">
                          +{o.rewardPoints.toLocaleString("en-IN")} reward pts
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span
                        className={cn(
                          "rounded-full px-3 py-1.5 text-xs font-bold",
                          o.step === 4
                            ? "bg-success text-success-foreground"
                            : "bg-secondary text-foreground",
                        )}
                      >
                        {orderSteps[o.step]}
                      </span>
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
                    {helpOpen ? "Close Help" : "Need Help?"}
                  </button>
                  {helpOpen && <OrderHelpPanel order={o} />}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
