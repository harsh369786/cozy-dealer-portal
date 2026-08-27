import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { DealerOrderListItem } from "@/services/orders";
import { useFormat } from "@/hooks/use-format";
import { useOrderStatusLabel } from "@/lib/i18n-labels";
import { submitComplaint } from "@/services/complaints";
import { getOrderById } from "@/services/orders";
import type { DistributorOrder } from "@/lib/mock/distributor/types";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useFormatApiError } from "@/lib/api-errors";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-semibold">{value}</span>
    </div>
  );
}

function OrderDetailsCard({ order }: { order: DistributorOrder }) {
  const { t } = useTranslation();
  const { formatCurrency } = useFormat();
  const statusLabel = useOrderStatusLabel(order.status);
  const productSummary =
    order.items.map((i) => `${i.quantity} × ${i.model}`).join(", ") || "—";

  return (
    <div className="rounded-2xl border border-border bg-card p-3 text-sm">
      <div className="space-y-2">
        <Row label={t("common.order")} value={`#${order.id}`} />
        <Row label={t("common.product")} value={productSummary} />
        <Row label={t("common.amount")} value={formatCurrency(order.totalValue)} />
        <Row label={t("common.status")} value={statusLabel} />
        {order.customerName && <Row label={t("common.customer")} value={order.customerName} />}
        {order.customerPhone && <Row label={t("common.customerPhone")} value={order.customerPhone} />}
        {order.customerAddress && (
          <Row label={t("common.deliveryAddress")} value={order.customerAddress} />
        )}
        {order.deliveryDate && <Row label={t("common.deliveryDate")} value={order.deliveryDate} />}
        {!order.deliveryDate && order.placedAt && (
          <Row label={t("common.placed")} value={order.placedAt} />
        )}
      </div>
    </div>
  );
}

export function OrderHelpPanel({
  order,
  onSubmitted,
  allowOrderLookup = false,
}: {
  order?: DealerOrderListItem;
  onSubmitted?: (complaintId: string) => void;
  allowOrderLookup?: boolean;
}) {
  const { t } = useTranslation();
  const formatApiError = useFormatApiError();
  const [orderIdInput, setOrderIdInput] = useState(order?.id ?? "");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupOrder, setLookupOrder] = useState<DistributorOrder | null>(null);
  const [description, setDescription] = useState("");
  const [submittedId, setSubmittedId] = useState<string | null>(null);

  const resolvedOrderId = order?.id ?? lookupOrder?.id ?? orderIdInput.trim();

  useEffect(() => {
    if (!order?.id || lookupOrder) return;
    void getOrderById(order.id).then((found) => {
      if (found) setLookupOrder(found);
    });
  }, [order?.id, lookupOrder]);

  const lookup = async () => {
    const id = orderIdInput.trim();
    if (!id) return;
    setLookupLoading(true);
    try {
      const found = await getOrderById(id);
      if (!found) {
        toast.error(t("common.orderNotFound"));
        setLookupOrder(null);
        return;
      }
      setLookupOrder(found);
    } catch (e) {
      toast.error(formatApiError(e, "common.couldNotLoadOrder"));
      setLookupOrder(null);
    } finally {
      setLookupLoading(false);
    }
  };

  const submit = async () => {
    if (!description.trim() || !resolvedOrderId) return;
    try {
      const res = await submitComplaint({
        orderId: resolvedOrderId,
        description: description.trim(),
      });
      toast.success(t("common.helpRequestSubmittedToast"), {
        description: t("common.helpRequestReference", { id: res.id }),
      });
      setSubmittedId(res.id);
      onSubmitted?.(res.id);
    } catch (e) {
      toast.error(formatApiError(e, "common.couldNotSubmitHelp"));
    }
  };

  if (submittedId) {
    return (
      <div className="mt-4 rounded-2xl border border-primary/30 bg-secondary/50 p-4 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full brand-gradient">
          <Check className="h-6 w-6 text-primary-foreground" strokeWidth={3} />
        </div>
        <p className="mt-3 font-display font-bold">{t("common.helpRequestSubmittedTitle")}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("common.referenceLabel", { id: submittedId })}
        </p>
        <Link
          to="/complaints/$complaintId"
          params={{ complaintId: submittedId }}
          className="press mt-3 inline-block text-sm font-bold text-primary"
        >
          {t("common.trackStatus")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4 rounded-2xl border border-border bg-secondary/40 p-4">
      {allowOrderLookup && !order && (
        <div>
          <p className="text-sm font-bold">{t("common.orderNumberLabel")}</p>
          <div className="mt-2 flex gap-2">
            <Input
              value={orderIdInput}
              onChange={(e) => {
                setOrderIdInput(e.target.value.toUpperCase());
                setLookupOrder(null);
              }}
              onBlur={() => void lookup()}
              placeholder={t("common.orderIdPlaceholder")}
              className="rounded-2xl font-semibold"
            />
            <button
              type="button"
              onClick={() => void lookup()}
              disabled={lookupLoading || !orderIdInput.trim()}
              className="press shrink-0 rounded-2xl border border-border bg-card px-4 text-sm font-bold"
            >
              {lookupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("common.find")}
            </button>
          </div>
        </div>
      )}

      {lookupOrder && <OrderDetailsCard order={lookupOrder} />}

      <div>
        <p className="text-sm font-bold">{t("common.describeIssue")}</p>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("common.issuePlaceholder")}
          className="mt-2 min-h-[100px] rounded-2xl"
        />
      </div>

      <button
        onClick={submit}
        disabled={!description.trim() || !resolvedOrderId}
        className={cn(
          "press h-12 w-full rounded-2xl text-sm font-bold",
          description.trim() && resolvedOrderId
            ? "brand-gradient text-primary-foreground"
            : "bg-muted text-muted-foreground",
        )}
      >
        {t("common.submitHelpRequest")}
      </button>
    </div>
  );
}
