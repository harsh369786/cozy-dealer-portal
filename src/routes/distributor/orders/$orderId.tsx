import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, MapPin, XCircle } from "lucide-react";
import { toast } from "sonner";
import { DistributorShell } from "@/components/distributor-shell";
import { StatusBadge } from "@/components/shared/status-badge";
import { OrderTimeline } from "@/components/shared/order-timeline";
import { ConfirmActionDialog, RejectOrderDialog } from "@/components/shared/dialogs";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAsyncData } from "@/hooks/use-async-data";
import { inr } from "@/lib/demo-data";
import { approveOrder, getOrderById, rejectOrder } from "@/services/orders";

export const Route = createFileRoute("/distributor/orders/$orderId")({
  component: OrderDetailPage,
});

function OrderDetailPage() {
  const { orderId } = Route.useParams();
  const [order, setOrder] = useState<Awaited<ReturnType<typeof getOrderById>>>(null);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [successType, setSuccessType] = useState<"approved" | "rejected">("approved");
  const [actionLoading, setActionLoading] = useState(false);

  const simulateError =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("error") === "1";

  const { loading, error, retry } = useAsyncData(async () => {
    const o = await getOrderById(orderId, simulateError);
    setOrder(o);
    return o;
  }, [orderId, simulateError]);

  const handleApprove = async () => {
    setActionLoading(true);
    try {
      const updated = await approveOrder(orderId);
      setOrder(updated);
      setApproveOpen(false);
      setSuccessType("approved");
      setSuccessOpen(true);
      toast.success("Order approved successfully");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to approve");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (reason: string) => {
    setActionLoading(true);
    try {
      const updated = await rejectOrder(orderId, reason);
      setOrder(updated);
      setRejectOpen(false);
      setSuccessType("rejected");
      setSuccessOpen(true);
      toast.success("Order rejected");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to reject");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <DistributorShell title="Order" back="/distributor/orders">
        <PageSkeleton rows={3} />
      </DistributorShell>
    );
  }

  if (error || !order) {
    return (
      <DistributorShell title="Order" back="/distributor/orders">
        <ErrorState message={error ?? "Order not found"} onRetry={retry} />
      </DistributorShell>
    );
  }

  const isPending = order.status === "pending_approval";

  return (
    <DistributorShell title={`#${order.id}`} back="/distributor/orders" showBell={false}>
      <div className="animate-rise space-y-4 pb-28">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-display text-xl font-bold">{order.dealerName}</p>
            <p className="text-sm text-muted-foreground">{order.dealerCode}</p>
          </div>
          <StatusBadge kind="order" status={order.status} />
        </div>

        <div className="rounded-3xl border border-border bg-card p-4 shadow-soft">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground">Placed</p>
              <p className="font-semibold">{order.placedAt}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Total</p>
              <p className="font-bold">{inr(order.totalValue)}</p>
            </div>
            {order.dealerAddress && (
              <div className="col-span-2">
                <p className="text-muted-foreground">Dealer address</p>
                <p className="mt-0.5 flex items-start gap-1.5 font-semibold">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{order.dealerAddress}</span>
                </p>
              </div>
            )}
            {order.customerName && (
              <div className="col-span-2">
                <p className="text-muted-foreground">Customer</p>
                <p className="font-semibold">{order.customerName}</p>
              </div>
            )}
          </div>
        </div>

        <div>
          <h2 className="mb-3 font-display font-bold">Items</h2>
          <div className="space-y-2">
            {order.items.map((item, i) => (
              <div key={i} className="rounded-2xl border border-border bg-card p-3 text-sm">
                <p className="font-semibold">
                  {item.model} — {item.size} × {item.thickness}
                </p>
                <p className="text-muted-foreground">Qty: {item.quantity}</p>
                <p className="mt-1 font-bold">
                  {inr(item.campaignPrice ?? item.dealerPrice)}
                  {item.campaignPrice && (
                    <span className="ml-2 text-xs font-normal text-primary">Campaign price</span>
                  )}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="mb-3 font-display font-bold">Timeline</h2>
          <OrderTimeline events={order.timeline} />
        </div>

        {order.rejectionReason && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-sm font-semibold text-destructive">Rejection reason</p>
            <p className="mt-1 text-sm">{order.rejectionReason}</p>
          </div>
        )}
      </div>

      {isPending && (
        <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-1/2 z-30 flex w-full max-w-[430px] -translate-x-1/2 gap-3 border-t border-border bg-card/95 px-5 py-3 backdrop-blur md:max-w-3xl lg:max-w-6xl">
          <Button
            variant="outline"
            className="h-12 flex-1 rounded-2xl border-destructive text-destructive"
            onClick={() => setRejectOpen(true)}
          >
            <XCircle className="mr-2 h-4 w-4" /> Reject
          </Button>
          <Button className="h-12 flex-1 rounded-2xl" onClick={() => setApproveOpen(true)}>
            <CheckCircle2 className="mr-2 h-4 w-4" /> Approve
          </Button>
        </div>
      )}

      <ConfirmActionDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        title="Approve Order"
        description={`Approve order #${order.id} from ${order.dealerName} for ${inr(order.totalValue)}?`}
        confirmLabel="Approve Order"
        onConfirm={handleApprove}
        loading={actionLoading}
      />

      <RejectOrderDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        onConfirm={handleReject}
        loading={actionLoading}
      />

      <Dialog open={successOpen} onOpenChange={setSuccessOpen}>
        <DialogContent className="rounded-3xl text-center sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              {successType === "approved" ? "Order Approved Successfully" : "Order Rejected"}
            </DialogTitle>
            <DialogDescription>
              Order #{order.id} · {order.dealerName}
              {successType === "rejected" && order.rejectionReason && (
                <span className="mt-2 block text-destructive">{order.rejectionReason}</span>
              )}
            </DialogDescription>
          </DialogHeader>
          <Button onClick={() => setSuccessOpen(false)} className="mt-2 w-full rounded-2xl">
            Done
          </Button>
        </DialogContent>
      </Dialog>
    </DistributorShell>
  );
}
