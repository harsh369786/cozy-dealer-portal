import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminPermissionGate } from "@/components/admin/admin-permission-gate";
import { AdminSection } from "@/components/admin/admin-section";
import { ConfirmActionDialog, RejectOrderDialog } from "@/components/shared/dialogs";
import { ORDER_STATUS_LABELS, OrderTimeline } from "@/components/shared/order-timeline";
import { StatusBadge } from "@/components/shared/status-badge";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAsyncData } from "@/hooks/use-async-data";
import { useAdminPermissions } from "@/hooks/use-admin-permissions";
import type { OrderStatus } from "@/lib/mock/distributor/types";
import { inr } from "@/lib/demo-data";
import {
  approveOrder,
  cancelOrder,
  fetchAllowedStatuses,
  getOrder,
  rejectOrder,
  updateOrderStatus,
} from "@/services/admin/orders";
import { MapPin, Printer, CheckCircle2, XCircle, Ban } from "lucide-react";

export const Route = createFileRoute("/admin/orders/$orderId")({
  component: AdminOrderDetailPage,
});

function AdminOrderDetailPage() {
  const { orderId } = Route.useParams();
  const { can, isMasterAdmin } = useAdminPermissions();
  const [order, setOrder] = useState<Awaited<ReturnType<typeof getOrder>>>(null);
  const [allowedStatuses, setAllowedStatuses] = useState<OrderStatus[]>([]);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [statusDraft, setStatusDraft] = useState<OrderStatus>("order_placed");

  const { loading, error, retry } = useAsyncData(async () => {
    const o = await getOrder(orderId);
    setOrder(o);
    if (o) {
      setStatusDraft(o.status);
      const allowed = await fetchAllowedStatuses(orderId).catch(() => [] as OrderStatus[]);
      setAllowedStatuses(allowed);
    }
    return o;
  }, [orderId]);

  const refresh = async () => {
    const updated = await getOrder(orderId);
    setOrder(updated);
    if (updated) {
      setStatusDraft(updated.status);
      const allowed = await fetchAllowedStatuses(orderId).catch(() => [] as OrderStatus[]);
      setAllowedStatuses(allowed);
    }
  };

  const handleApprove = async () => {
    setActionLoading(true);
    try {
      await approveOrder(orderId);
      await refresh();
      setApproveOpen(false);
      toast.success("Order approved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to approve");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (reason: string) => {
    setActionLoading(true);
    try {
      await rejectOrder(orderId, reason);
      await refresh();
      setRejectOpen(false);
      toast.success("Order rejected");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to reject");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    setActionLoading(true);
    try {
      await cancelOrder(orderId);
      await refresh();
      setCancelOpen(false);
      toast.success("Order cancelled");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to cancel");
    } finally {
      setActionLoading(false);
    }
  };

  const handleStatusChange = async () => {
    if (!order || statusDraft === order.status) return;
    setActionLoading(true);
    try {
      await updateOrderStatus(orderId, statusDraft);
      await refresh();
      toast.success("Order status updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update status");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <PageSkeleton rows={4} />;
  if (error || !order) return <ErrorState message={error ?? "Order not found"} onRetry={retry} />;

  const isPending = order.status === "order_placed";
  const statusOptions: OrderStatus[] = isMasterAdmin
    ? (["order_placed", "approved", "in_making", "out_for_delivery", "delivered", "cancelled"] as OrderStatus[]).filter(
        (s) => s !== order.status,
      )
    : allowedStatuses;
  const canChangeStatus = statusOptions.length > 0;
  const totalPoints = order.items.reduce((sum, item) => sum + (item.points ?? 0), 0);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={`Order #${order.id}`}
        description={`${order.dealerName} · ${order.distributorName ?? "—"}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/admin/orders/$orderId/print" params={{ orderId }}>
              <Button variant="outline" className="rounded-2xl font-bold">
                <Printer className="mr-2 h-4 w-4" /> Print job card
              </Button>
            </Link>
            <Link to="/admin/orders">
              <Button variant="outline" className="rounded-2xl font-bold">← Back</Button>
            </Link>
          </div>
        }
      />

      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-display text-xl font-bold">{order.dealerName}</p>
          <p className="text-sm text-muted-foreground">{order.dealerCode}</p>
        </div>
        <StatusBadge kind="order" status={order.status} />
      </div>

      {canChangeStatus && (
        <AdminSection title="Change status">
          <div className="flex max-w-md flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label>Order status</Label>
              <Select value={statusDraft} onValueChange={(v) => setStatusDraft(v as OrderStatus)}>
                <SelectTrigger className="mt-1 rounded-2xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={order.status}>{ORDER_STATUS_LABELS[order.status]}</SelectItem>
                  {statusOptions.map((s) => (
                    <SelectItem key={s} value={s}>
                      {ORDER_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="rounded-2xl font-bold"
              onClick={handleStatusChange}
              disabled={actionLoading || statusDraft === order.status}
            >
              {actionLoading ? "Saving…" : "Update status"}
            </Button>
          </div>
        </AdminSection>
      )}

      <AdminSection title="Order summary">
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <p className="text-muted-foreground">Placed</p>
            <p className="font-semibold">{order.placedAt}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Total</p>
            <p className="font-bold">{inr(order.totalValue)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Reward points</p>
            <p className="font-bold text-primary">{totalPoints.toLocaleString("en-IN")} pts</p>
          </div>
          {order.dealerAddress && (
            <div className="sm:col-span-2">
              <p className="text-muted-foreground">Dealer address</p>
              <p className="mt-0.5 flex items-start gap-1.5 font-semibold">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{order.dealerAddress}</span>
              </p>
            </div>
          )}
        </div>
      </AdminSection>

      <AdminSection title="Items">
        <div className="space-y-2">
          {order.items.map((item, i) => (
            <div key={i} className="rounded-2xl bg-secondary/40 px-3 py-2 text-sm">
              <p className="font-semibold">
                {item.model} — {item.size} × {item.thickness}
              </p>
              <p className="text-muted-foreground">Qty: {item.quantity}</p>
              <p className="font-bold">{inr(item.campaignPrice ?? item.dealerPrice)}</p>
              {item.points ? (
                <p className="text-xs font-semibold text-primary">+{item.points.toLocaleString("en-IN")} reward pts</p>
              ) : null}
            </div>
          ))}
        </div>
      </AdminSection>

      <AdminSection title="Status timeline">
        <OrderTimeline events={order.timeline} />
      </AdminSection>

      {isPending && can("orders:approve") && (
        <div className="flex gap-2">
          <Button variant="outline" className="rounded-2xl font-bold" onClick={() => setRejectOpen(true)}>
            <XCircle className="mr-2 h-4 w-4" /> Reject
          </Button>
          <Button className="rounded-2xl font-bold" onClick={() => setApproveOpen(true)}>
            <CheckCircle2 className="mr-2 h-4 w-4" /> Approve
          </Button>
        </div>
      )}

      {order.status === "approved" && can("orders:cancel") && (
        <div className="flex gap-2">
          <Button
            variant="destructive"
            className="rounded-2xl font-bold"
            onClick={() => setCancelOpen(true)}
          >
            <Ban className="mr-2 h-4 w-4" /> Cancel approved order
          </Button>
        </div>
      )}

      <ConfirmActionDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        title="Approve order"
        description={`Approve order #${order.id}?`}
        confirmLabel="Approve"
        onConfirm={handleApprove}
        loading={actionLoading}
      />
      <RejectOrderDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        onConfirm={handleReject}
        loading={actionLoading}
      />
      <ConfirmActionDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel approved order?"
        description={`This will cancel order #${order.id}. This action is restricted to master admin.`}
        confirmLabel="Cancel order"
        onConfirm={handleCancel}
        loading={actionLoading}
        variant="destructive"
      />
    </div>
  );
}
