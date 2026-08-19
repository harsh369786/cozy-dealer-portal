import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DistributorShell } from "@/components/distributor-shell";
import { OrderCard } from "@/components/shared/order-card";
import { SearchBar, matchesSearch } from "@/components/shared/search-bar";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/shared/states";
import { useAsyncData } from "@/hooks/use-async-data";
import { getOrders, getPendingOrders } from "@/services/orders";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/distributor/orders/")({
  component: OrdersPage,
});

type Tab = "pending" | "all";

function OrdersPage() {
  const [tab, setTab] = useState<Tab>("pending");
  const [search, setSearch] = useState("");
  const simulateError =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("error") === "1";

  const { data, loading, error, retry } = useAsyncData(
    () => (tab === "pending" ? getPendingOrders(simulateError) : getOrders(simulateError)),
    [tab, simulateError],
  );

  const filtered = useMemo(
    () =>
      data?.filter((o) =>
        matchesSearch(search, o.id, o.storeName, o.dealerName, o.contactName, o.dealerCode),
      ) ?? [],
    [data, search],
  );

  return (
    <DistributorShell title="Orders">
      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search by Order ID, store or dealer name…"
      />

      <div className="mt-4 flex gap-2 rounded-2xl bg-secondary p-1">
        {(["pending", "all"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
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
        {!loading && !error && filtered.length === 0 && (
          <EmptyState
            title={search ? "No matching orders" : tab === "pending" ? "No pending orders" : "No orders yet"}
            description={
              search
                ? "Try a different Order ID, store name, or dealer name."
                : "Orders from your dealers will appear here."
            }
          />
        )}
        {!loading && !error && filtered.length > 0 && (
          <div className="space-y-3">
            {filtered.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        )}
      </div>
    </DistributorShell>
  );
}
