import { Link } from "@tanstack/react-router";
import { ChevronRight, MapPin } from "lucide-react";
import type { DistributorDealer } from "@/lib/mock/distributor/types";
import { inr } from "@/lib/demo-data";
import { cn } from "@/lib/utils";

export function DealerCard({ dealer }: { dealer: DistributorDealer }) {
  return (
    <Link
      to="/distributor/dealers/$dealerId"
      params={{ dealerId: dealer.id }}
      className="press block rounded-3xl border border-border bg-card p-4 shadow-soft"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-display font-bold">{dealer.name}</p>
          <p className="text-xs font-semibold text-muted-foreground">{dealer.code}</p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
            dealer.active ? "bg-emerald-100 text-emerald-900" : "bg-muted text-muted-foreground",
          )}
        >
          {dealer.active ? "Active" : "Inactive"}
        </span>
      </div>
      <p className="mt-2 flex items-center gap-1 text-sm text-muted-foreground">
        <MapPin className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{dealer.location}</span>
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">This month</p>
          <p className="font-bold">{inr(dealer.monthSales)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Pending orders</p>
          <p className="font-bold">{dealer.pendingOrders}</p>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-end text-xs font-semibold text-primary">
        View dealer <ChevronRight className="h-4 w-4" />
      </div>
    </Link>
  );
}
