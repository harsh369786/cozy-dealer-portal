import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { DistributorShell } from "@/components/distributor-shell";
import { StatusBadge } from "@/components/shared/status-badge";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { useAsyncData } from "@/hooks/use-async-data";
import { useFormat } from "@/hooks/use-format";
import { getComplaintById } from "@/services/complaints";
import { getOrderById } from "@/services/orders";

export const Route = createFileRoute("/distributor/complaints/$complaintId")({
  component: ComplaintDetailPage,
});

function ComplaintDetailPage() {
  const { t } = useTranslation();
  const { formatCurrency } = useFormat();
  const { complaintId } = Route.useParams();
  const { data, loading, error, retry } = useAsyncData(
    () => getComplaintById(complaintId),
    [complaintId],
  );
  const { data: order } = useAsyncData(
    () => (data?.orderId ? getOrderById(data.orderId) : Promise.resolve(null)),
    [data?.orderId],
  );

  if (loading) {
    return (
      <DistributorShell title={t("distributor.complaints.title")} back="/distributor/complaints" showBell={false}>
        <PageSkeleton rows={3} />
      </DistributorShell>
    );
  }

  if (error || !data) {
    return (
      <DistributorShell title={t("distributor.complaints.title")} back="/distributor/complaints" showBell={false}>
        <ErrorState message={error ?? t("errors.notFound")} onRetry={retry} />
      </DistributorShell>
    );
  }

  return (
    <DistributorShell title={data.id} back="/distributor/complaints" showBell={false}>
      <div className="animate-rise space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold">{data.dealerName}</p>
            {data.orderId ? (
              <Link
                to="/distributor/orders/$orderId"
                params={{ orderId: data.orderId }}
                className="text-sm font-bold text-primary"
              >
                {t("common.orderHash", { orderId: data.orderId })}
              </Link>
            ) : (
              <p className="text-sm text-muted-foreground">{t("common.orderHash", { orderId: data.orderId })}</p>
            )}
          </div>
          <StatusBadge kind="complaint" status={data.status} />
        </div>

        {order && (
          <div className="rounded-3xl border border-border bg-card p-4 shadow-soft">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-muted-foreground">{t("dealer.orderDetail.title")}</p>
              <StatusBadge kind="order" status={order.status} />
            </div>
            <p className="mt-2 font-semibold">{order.storeName ?? order.dealerName}</p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {order.items.map((item) => (
                <li key={`${item.productId}-${item.size}-${item.thickness}`}>
                  {item.quantity} × {item.model} · {item.sizeRequested ?? item.size} × {item.thickness}
                </li>
              ))}
            </ul>
            <p className="mt-3 font-display text-lg font-bold">{formatCurrency(order.totalValue)}</p>
          </div>
        )}

        <div className="rounded-3xl border border-border bg-card p-4 shadow-soft">
          <p className="text-sm font-semibold text-muted-foreground">{t("common.product")}</p>
          <p className="font-semibold">{data.category}</p>
          <p className="mt-4 text-sm font-semibold text-muted-foreground">{t("common.describeIssue")}</p>
          <p className="mt-1">{data.description}</p>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground">{t("common.submitted")}</p>
              <p className="font-semibold">{data.createdAt}</p>
            </div>
            <div>
              <p className="text-muted-foreground">{t("common.change")}</p>
              <p className="font-semibold">{data.updatedAt}</p>
            </div>
          </div>
        </div>

        {data.orderId && (
          <Link
            to="/distributor/orders/$orderId"
            params={{ orderId: data.orderId }}
            className="press block rounded-2xl border border-border bg-secondary py-3 text-center text-sm font-bold"
          >
            {t("common.viewOrder")}
          </Link>
        )}

        <p className="rounded-2xl bg-secondary/60 p-4 text-sm text-muted-foreground">
          {t("distributor.complaints.readOnlyNote")}
        </p>
      </div>
    </DistributorShell>
  );
}
