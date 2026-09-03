import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, MapPin, PackageCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { DistributorShell } from "@/components/distributor-shell";
import { StatusBadge } from "@/components/shared/status-badge";
import { OrderNotesPanel } from "@/components/shared/order-notes-panel";
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
import { useAdminPermissions } from "@/hooks/use-admin-permissions";
import { useFormat } from "@/hooks/use-format";
import { useFormatApiError } from "@/lib/api-errors";
import { approveOrder, getOrderById, getOrderStatusOptions, rejectOrder, updateOrderStatus } from "@/services/orders";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/distributor/orders/$orderId")({
  component: OrderDetailPage,
});

function OrderDetailPage() {
  const { t } = useTranslation();
  const { formatCurrency, formatNumber } = useFormat();
  const formatApiError = useFormatApiError();
  const { orderId } = Route.useParams();
  const { can } = useAdminPermissions();
  const canApprove = can("orders:approve");
  const canReject = can("orders:reject");
  const canDeliver = can("orders:deliver");
  const [order, setOrder] = useState<Awaited<ReturnType<typeof getOrderById>>>(null);
  const [deliverableStatuses, setDeliverableStatuses] = useState<string[]>([]);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [successType, setSuccessType] = useState<"approved" | "rejected" | "delivered">("approved");
  const [actionLoading, setActionLoading] = useState(false);

  const simulateError =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("error") === "1";

  const { loading, error, retry } = useAsyncData(async () => {
    const o = await getOrderById(orderId, simulateError);
    setOrder(o);
    if (o && canDeliver) {
      try {
        const allowed = await getOrderStatusOptions(orderId);
        setDeliverableStatuses(allowed);
      } catch {
        setDeliverableStatuses([]);
      }
    } else {
      setDeliverableStatuses([]);
    }
    return o;
  }, [orderId, simulateError, canDeliver]);

  const handleApprove = async () => {
    setActionLoading(true);
    try {
      const updated = await approveOrder(orderId);
      setOrder(updated);
      setApproveOpen(false);
      setSuccessType("approved");
      setSuccessOpen(true);
      toast.success(t("distributor.orderDetail.approveSuccess"));
      window.dispatchEvent(new CustomEvent("backrest:dashboard-refresh"));
    } catch (e) {
      toast.error(formatApiError(e, "errors.failedToApprove"));
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
      toast.success(t("distributor.orderDetail.rejectSuccess"));
    } catch (e) {
      toast.error(formatApiError(e, "errors.failedToReject"));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeliver = async () => {
    setActionLoading(true);
    try {
      const updated = await updateOrderStatus(orderId, "delivered");
      setOrder(updated);
      setDeliverableStatuses([]);
      setDeliverOpen(false);
      setSuccessType("delivered");
      setSuccessOpen(true);
      toast.success(t("distributor.orderDetail.deliverSuccess"));
      window.dispatchEvent(new CustomEvent("backrest:dashboard-refresh"));
    } catch (e) {
      toast.error(formatApiError(e, "common.couldNotUpdateOrder"));
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <DistributorShell title={t("distributor.orderDetail.title")} back="/distributor/orders">
        <PageSkeleton rows={3} />
      </DistributorShell>
    );
  }

  if (error || !order) {
    return (
      <DistributorShell title={t("distributor.orderDetail.title")} back="/distributor/orders">
        <ErrorState message={error ?? t("common.orderNotFound")} onRetry={retry} />
      </DistributorShell>
    );
  }

  const isPending = order.status === "order_placed";
  const showOrderActions = isPending && (canApprove || canReject);
  const canMarkDelivered = canDeliver && deliverableStatuses.includes("delivered");
  const showDeliverAction = canMarkDelivered && !isPending;
  const showBottomBar = showOrderActions || showDeliverAction;

  return (
    <DistributorShell title={`#${order.id}`} back="/distributor/orders" showBell={false}>
      <div className={cn("animate-rise space-y-4", showBottomBar ? "pb-28" : "pb-6")}>
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
              <p className="text-muted-foreground">{t("distributor.orderDetail.placedLabel")}</p>
              <p className="font-semibold">{order.placedAt}</p>
            </div>
            <div>
              <p className="text-muted-foreground">{t("common.amount")}</p>
              <p className="font-bold">{formatCurrency(order.totalValue)}</p>
            </div>
            {order.dealerAddress && (
              <div className="col-span-2">
                <p className="text-muted-foreground">{t("distributor.orderDetail.addressLabel")}</p>
                <p className="mt-0.5 flex items-start gap-1.5 font-semibold">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{order.dealerAddress}</span>
                </p>
              </div>
            )}
            {order.dealerPhone && (
              <div className="col-span-2">
                <p className="text-muted-foreground">{t("common.mobile")}</p>
                <a
                  href={`tel:${order.dealerPhone.replace(/\s/g, "")}`}
                  className="mt-0.5 inline-block font-semibold text-primary hover:underline"
                >
                  {order.dealerPhone}
                </a>
              </div>
            )}
            {order.customerName && (
              <div className="col-span-2">
                <p className="text-muted-foreground">{t("common.customer")}</p>
                <p className="font-semibold">{order.customerName}</p>
              </div>
            )}
          </div>
        </div>

        <OrderNotesPanel orderNotes={order.notes} items={order.items} />

        <div>
          <h2 className="mb-3 font-display font-bold">{t("distributor.orderDetail.itemsLabel")}</h2>
          <div className="space-y-2">
            {order.items.map((item, i) => (
              <div key={i} className="rounded-2xl border border-border bg-card p-3 text-sm">
                <p className="font-semibold">
                  {item.model} — {item.sizeRequested ?? item.size} × {item.thickness}
                </p>
                {item.sizeRequested && item.sizeStandard && item.sizeRequested !== item.sizeStandard && (
                  <p className="text-xs text-muted-foreground">
                    {t("dealer.orderDetail.pricedAsStandard", { size: item.sizeStandard })}
                  </p>
                )}
                <p className="text-muted-foreground">
                  {t("common.quantity")}: {item.quantity}
                </p>
                <p className="mt-1 font-bold">
                  {formatCurrency(item.campaignPrice ?? item.dealerPrice)}
                  {item.campaignPrice && (
                    <span className="ml-2 text-xs font-normal text-primary">{t("common.campaignPrice")}</span>
                  )}
                </p>
                {item.points ? (
                  <p className="text-xs font-semibold text-primary">
                    +{formatNumber(item.points)} {t("common.rewardPoints")}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="mb-3 font-display font-bold">{t("common.orderTimeline")}</h2>
          <OrderTimeline events={order.timeline} />
        </div>

        {order.rejectionReason && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-sm font-semibold text-destructive">{t("common.rejectionReason")}</p>
            <p className="mt-1 text-sm">{order.rejectionReason}</p>
          </div>
        )}
      </div>

      {showOrderActions && (
        <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-1/2 z-30 flex w-full max-w-[430px] -translate-x-1/2 gap-3 border-t border-border bg-card/95 px-5 py-3 backdrop-blur md:max-w-3xl lg:max-w-6xl">
          {canReject && (
            <Button
              variant="outline"
              className="h-12 flex-1 rounded-2xl border-destructive text-destructive"
              onClick={() => setRejectOpen(true)}
            >
              <XCircle className="mr-2 h-4 w-4" /> {t("common.reject")}
            </Button>
          )}
          {canApprove && (
            <Button className="h-12 flex-1 rounded-2xl" onClick={() => setApproveOpen(true)}>
              <CheckCircle2 className="mr-2 h-4 w-4" /> {t("common.approve")}
            </Button>
          )}
        </div>
      )}

      {showDeliverAction && !showOrderActions && (
        <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-1/2 z-30 w-full max-w-[430px] -translate-x-1/2 border-t border-border bg-card/95 px-5 py-3 backdrop-blur md:max-w-3xl lg:max-w-6xl">
          <Button className="h-12 w-full rounded-2xl" onClick={() => setDeliverOpen(true)}>
            <PackageCheck className="mr-2 h-4 w-4" /> {t("distributor.orderDetail.markDelivered")}
          </Button>
        </div>
      )}

      <ConfirmActionDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        title={t("distributor.confirmApprove.title")}
        description={t("distributor.confirmApprove.description")}
        confirmLabel={t("distributor.confirmApprove.confirmLabel")}
        onConfirm={handleApprove}
        loading={actionLoading}
      />

      <ConfirmActionDialog
        open={deliverOpen}
        onOpenChange={setDeliverOpen}
        title={t("distributor.orderDetail.confirmDeliver.title")}
        description={t("distributor.orderDetail.confirmDeliver.description")}
        confirmLabel={t("distributor.orderDetail.confirmDeliver.confirmLabel")}
        onConfirm={handleDeliver}
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
              {successType === "approved"
                ? t("distributor.orderDetail.orderApproved")
                : successType === "rejected"
                  ? t("distributor.orderDetail.orderRejected")
                  : t("distributor.orderDetail.deliverSuccess")}
            </DialogTitle>
            <DialogDescription>
              {t("common.orderHash", { orderId: order.id })} · {order.dealerName}
              {successType === "rejected" && order.rejectionReason && (
                <span className="mt-2 block text-destructive">{order.rejectionReason}</span>
              )}
            </DialogDescription>
          </DialogHeader>
          <Button onClick={() => setSuccessOpen(false)} className="mt-2 w-full rounded-2xl">
            {t("common.gotIt")}
          </Button>
        </DialogContent>
      </Dialog>
    </DistributorShell>
  );
}
