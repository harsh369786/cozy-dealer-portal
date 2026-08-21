import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { ListPagination } from "@/components/shared/list-pagination";
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

function Orders() {
  const [helpOrderId, setHelpOrderId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

  const { data, loading, error, retry } = useAsyncData(
    () => listDealerOrdersPage({ page, pageSize: 10, search: search.trim() || undefined }),
    [page, search],
  );

  const orderRecords = data?.items ?? [];

  return (
    <AppShell title="My Orders">
      <SearchBar
        value={search}
        onChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
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

      {!loading && !error && orderRecords.length === 0 && (
        <p className="rounded-3xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          {search.trim()
            ? "No orders match your search."
            : "No orders yet. Place your first order from Products."}
        </p>
      )}

      {!loading && !error && orderRecords.length > 0 && (
        <>
          <div className="space-y-3">
            {orderRecords.map((o, i) => {
              const helpOpen = helpOrderId === o.id;
              return (
                <div
                  key={o.id}
                  className="animate-rise rounded-3xl border border-border bg-card shadow-soft"
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

          {data && (
            <ListPagination page={data.page} totalPages={data.totalPages} onPageChange={setPage} />
          )}
        </>
      )}
    </AppShell>
  );
}
