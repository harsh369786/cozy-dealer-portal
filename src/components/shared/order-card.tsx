import { Link } from "@tanstack/react-router";
import { Calendar, ChevronRight, Clock, MapPin } from "lucide-react";
import type { DistributorOrder } from "@/lib/mock/distributor/types";
import { inr } from "@/lib/demo-data";
import { StatusBadge } from "./status-badge";

export function OrderCard({ order }: { order: DistributorOrder }) {
  return (
    <Link
      to="/distributor/orders/$orderId"
      params={{ orderId: order.id }}
      className="press block rounded-3xl border border-border bg-card p-4 shadow-soft"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display font-bold">#{order.id}</p>
          <p className="mt-0.5 truncate text-sm font-bold">{order.storeName ?? order.dealerName}</p>
          {order.contactName && (
            <p className="truncate text-xs text-muted-foreground">{order.contactName}</p>
          )}
        </div>
        <StatusBadge kind="order" status={order.status} />
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Calendar className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span>{order.placedAt}</span>
      </p>
      <div className="mt-2 flex items-center justify-between text-sm">
        <span className="font-semibold">{inr(order.totalValue)}</span>
        <span className="text-muted-foreground">{order.totalItems} items</span>
      </div>
      {order.dealerAddress && (
        <p className="mt-2 flex items-start gap-1 text-xs text-muted-foreground">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="line-clamp-2">{order.dealerAddress}</span>
        </p>
      )}
      {order.status === "order_placed" && order.pendingHours > 0 && (
        <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-amber-700">
          <Clock className="h-3.5 w-3.5" />
          Pending {order.pendingHours}h
        </p>
      )}
      <div className="mt-2 flex items-center justify-end text-xs font-semibold text-primary">
        View details <ChevronRight className="h-4 w-4" />
      </div>
    </Link>
  );
}
