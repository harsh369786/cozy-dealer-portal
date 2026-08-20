import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Gift, HelpCircle } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { OrderHelpPanel } from "@/components/shared/order-help-panel";
import { OrderTimeline } from "@/components/shared/order-timeline";
import { StatusBadge } from "@/components/shared/status-badge";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { requireRoles } from "@/lib/auth-guard";
import { inr } from "@/lib/demo-data";
import type { OrderStatus } from "@/lib/mock/distributor/types";
import { useAsyncData } from "@/hooks/use-async-data";
import { getOrderById } from "@/services/orders";
import type { DealerOrderListItem } from "@/services/orders";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/orders/$orderId")({
  beforeLoad: () => requireRoles(["dealer"]),
  component: DealerOrderDetail,
});

function DealerOrderDetail() {
  const { orderId } = Route.useParams();
  const [helpOpen, setHelpOpen] = useState(false);

  const { data: order, loading, error, retry } = useAsyncData(
    () => getOrderById(orderId),
    [orderId],
  );

  if (loading) {
    return (
      <AppShell title="Order" back="/orders">
        <PageSkeleton rows={4} />
      </AppShell>
    );
  }

  if (error || !order) {
    return (
      <AppShell title="Order" back="/orders">
        <ErrorState message={error ?? "Order not found"} onRetry={retry} />
      </AppShell>
    );
  }

  const helpOrder: DealerOrderListItem = {
    id: order.id,
    product: order.items[0]?.model ?? "Order",
    size: order.items[0]?.size ?? "",
    thickness: order.items[0]?.thickness ?? "",
    quantity: order.totalItems,
    dealer: order.storeName ?? order.dealerName,
    status: order.status,
    placed: order.placedAt,
    amount: order.totalValue,
    step: 0,
    detail: order.items.map((i) => `${i.quantity} × ${i.size} × ${i.thickness}`).join(", "),
  };

  const status = order.status as OrderStatus;
  const totalPoints = order.items.reduce((sum, i) => sum + (i.points ?? 0), 0);

  return (
    <AppShell title={`#${order.id}`} back="/orders">
      <div className="animate-rise space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm text-muted-foreground">Placed {order.placedAt}</p>
          </div>
          <StatusBadge kind="order" status={status} />
        </div>

        {order.items.map((item, i) => {
          const unitPrice = item.campaignPrice ?? item.dealerPrice;
          const lineMrp = item.mrp * item.quantity;
          const lineDealer = item.dealerPrice * item.quantity;
          const linePay = unitPrice * item.quantity;
          const sizeLine = [item.size, item.thickness !== "—" ? item.thickness : null]
            .filter(Boolean)
            .join(" × ");

          return (
            <div key={i} className="rounded-3xl border border-border bg-card p-5 shadow-soft">
              <p className="font-display text-lg font-bold">{item.model}</p>
              {item.quantity > 1 && (
                <p className="mt-1 text-sm text-muted-foreground">Quantity: {item.quantity}</p>
              )}

              <div className="mt-4 rounded-2xl bg-secondary/60 px-4 py-4">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      MRP
                    </p>
                    <p className="font-display text-lg font-bold text-muted-foreground line-through">
                      {inr(lineMrp)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Dealer Price
                    </p>
                    <p className="font-display text-2xl font-bold text-primary">
                      {inr(item.campaignPrice ? linePay : lineDealer)}
                    </p>
                  </div>
                </div>

                {sizeLine && (
                  <p className="mt-3 text-sm font-semibold text-foreground">{sizeLine}</p>
                )}

                {item.campaignPrice && item.campaignPrice < item.dealerPrice && (
                  <p className="mt-2 text-xs font-semibold text-primary">
                    Campaign price applied (was {inr(lineDealer)})
                  </p>
                )}

                <p className="mt-3 flex items-center gap-1.5 text-sm font-bold text-primary">
                  <Gift className="h-4 w-4" />
                  You&apos;ll earn {item.points * item.quantity} reward points 🎁
                </p>
              </div>

              {item.freeItems && (
                <p className="mt-3 text-sm text-muted-foreground">Free: {item.freeItems}</p>
              )}
            </div>
          );
        })}

        <div className="rounded-2xl border border-border bg-card px-4 py-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Order total</span>
            <span className="font-display text-lg font-bold">{inr(order.totalValue)}</span>
          </div>
          {totalPoints > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Total reward points: {totalPoints}
            </p>
          )}
        </div>

        {order.customerName && (
          <div className="rounded-2xl border border-border bg-card p-4 text-sm">
            <p className="font-semibold text-muted-foreground">Customer</p>
            <p className="mt-1 font-bold">{order.customerName}</p>
            {order.customerPhone && (
              <p className="text-muted-foreground">{order.customerPhone}</p>
            )}
          </div>
        )}

        <div>
          <h2 className="mb-3 font-display font-bold">Order Timeline</h2>
          <OrderTimeline events={order.timeline} />
        </div>

        {order.rejectionReason && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-sm font-semibold text-destructive">Rejection reason</p>
            <p className="mt-1 text-sm">{order.rejectionReason}</p>
          </div>
        )}

        <button
          type="button"
          onClick={() => setHelpOpen((v) => !v)}
          className={cn(
            "press flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-base font-bold",
            helpOpen
              ? "border border-primary bg-secondary text-primary"
              : "border border-border bg-card text-foreground",
          )}
        >
          <HelpCircle className="h-5 w-5" />
          {helpOpen ? "Close Help" : "Need Help?"}
        </button>

        {helpOpen && <OrderHelpPanel order={helpOrder} />}

        <Link
          to="/complaints"
          className="press block rounded-2xl border border-border bg-secondary py-3 text-center text-sm font-bold"
        >
          View all help requests
        </Link>
      </div>
    </AppShell>
  );
}
