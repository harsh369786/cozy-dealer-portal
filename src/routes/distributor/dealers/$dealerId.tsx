import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { MapPin, Phone, Mail } from "lucide-react";
import { DistributorShell } from "@/components/distributor-shell";
import { StatusBadge } from "@/components/shared/status-badge";
import { OrderCard } from "@/components/shared/order-card";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { useAsyncData } from "@/hooks/use-async-data";
import { inr } from "@/lib/demo-data";
import { getDealerById } from "@/services/dealers";
import { getOrdersByDealer } from "@/services/orders";
import { getComplaintsByDealer } from "@/services/complaints";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/distributor/dealers/$dealerId")({
  component: DealerDetailPage,
});

const tabs = ["Overview", "Orders", "Complaints", "Rewards", "Activity"] as const;
type Tab = (typeof tabs)[number];

function DealerDetailPage() {
  const { dealerId } = Route.useParams();
  const [tab, setTab] = useState<Tab>("Overview");

  const dealerQuery = useAsyncData(() => getDealerById(dealerId), [dealerId]);
  const ordersQuery = useAsyncData(() => getOrdersByDealer(dealerId), [dealerId]);
  const complaintsQuery = useAsyncData(() => getComplaintsByDealer(dealerId), [dealerId]);

  const loading = dealerQuery.loading;
  const dealer = dealerQuery.data;

  if (loading) {
    return (
      <DistributorShell title="Dealer" back="/distributor/dealers">
        <PageSkeleton rows={4} />
      </DistributorShell>
    );
  }

  if (dealerQuery.error || !dealer) {
    return (
      <DistributorShell title="Dealer" back="/distributor/dealers">
        <ErrorState message={dealerQuery.error ?? "Dealer not found"} onRetry={dealerQuery.retry} />
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
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "press shrink-0 rounded-full px-4 py-2 text-sm font-semibold",
              tab === t
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "Overview" && (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Month sales</p>
              <p className="font-display text-lg font-bold">{inr(dealer.monthSales)}</p>
              <p
                className={cn(
                  "text-xs font-semibold",
                  dealer.salesGrowth >= 0 ? "text-success" : "text-destructive",
                )}
              >
                {dealer.salesGrowth >= 0 ? "+" : ""}
                {dealer.salesGrowth}% growth
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Total orders</p>
              <p className="font-display text-lg font-bold">{dealer.orderCount}</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Pending orders</p>
              <p className="font-display text-lg font-bold">{dealer.pendingOrders}</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Reward points</p>
              <p className="font-display text-lg font-bold">
                {dealer.rewardPoints.toLocaleString("en-IN")}
              </p>
            </div>
          </div>
        )}

        {tab === "Orders" && (
          <div className="space-y-3">
            {ordersQuery.loading && <PageSkeleton />}
            {ordersQuery.data?.map((o) => (
              <OrderCard key={o.id} order={o} />
            ))}
            {!ordersQuery.loading && ordersQuery.data?.length === 0 && (
              <p className="text-center text-sm text-muted-foreground">
                No orders from this dealer.
              </p>
            )}
          </div>
        )}

        {tab === "Complaints" && (
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
              <p className="text-center text-sm text-muted-foreground">No complaints.</p>
            )}
          </div>
        )}

        {tab === "Rewards" && (
          <div className="rounded-3xl border border-border bg-card p-6 text-center">
            <p className="font-display text-3xl font-bold">
              {dealer.rewardPoints.toLocaleString("en-IN")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">Total reward points earned</p>
            <p className="mt-4 text-sm text-muted-foreground">
              Lifetime sales: {inr(dealer.totalSales)}
            </p>
          </div>
        )}

        {tab === "Activity" && (
          <div className="rounded-2xl border border-border bg-card p-4 text-sm">
            <p>
              <span className="text-muted-foreground">Last order:</span>{" "}
              <span className="font-semibold">{dealer.lastOrderDate}</span>
            </p>
            <p className="mt-2">
              <span className="text-muted-foreground">Open complaints:</span>{" "}
              <span className="font-semibold">{dealer.openComplaints}</span>
            </p>
            <p className="mt-2">
              <span className="text-muted-foreground">Status:</span>{" "}
              <span className="font-semibold">{dealer.active ? "Active" : "Inactive"}</span>
            </p>
          </div>
        )}
      </div>
    </DistributorShell>
  );
}
