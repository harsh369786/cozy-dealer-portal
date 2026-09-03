import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Gift, HelpCircle, Pencil } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { OrderNotesPanel } from "@/components/shared/order-notes-panel";
import { OrderTimeline } from "@/components/shared/order-timeline";
import { StatusBadge } from "@/components/shared/status-badge";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { requireRoles } from "@/lib/auth-guard";
import { formatFreeItemsDisplay } from "@/lib/free-items";
import type { OrderStatus } from "@/lib/mock/distributor/types";
import { useAsyncData } from "@/hooks/use-async-data";
import { useFormat } from "@/hooks/use-format";
import { useFormatApiError } from "@/lib/api-errors";
import { getOrderById, updateOrderLineItems } from "@/services/orders";
import {
  BREADTHS,
  getMattressDimensionError,
  LENGTHS,
  mapToCeilStandardSize,
  MAX_MATTRESS_BREADTH_IN,
  MAX_MATTRESS_LENGTH_IN,
  MIN_MATTRESS_BREADTH_IN,
  MIN_MATTRESS_LENGTH_IN,
  parseDimensionInput,
  snapDimensionInput,
  snapToCeilStandardInput,
} from "@/lib/mattress-size";
import type { DealerOrderListItem } from "@/services/orders";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/orders/$orderId")({
  beforeLoad: () => requireRoles(["dealer"]),
  component: DealerOrderDetail,
});

function translateMattressDimensionError(
  err: string,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (err === "Enter valid length and width") return t("validation.enterValidLengthWidth");
  const lengthMin = err.match(/^Length must be at least (\d+)"$/);
  if (lengthMin) return t("validation.lengthMin", { min: lengthMin[1] });
  const lengthMax = err.match(/^Length must be at most (\d+)"$/);
  if (lengthMax) return t("validation.lengthMax", { max: lengthMax[1] });
  const widthMin = err.match(/^Width must be at least (\d+)"$/);
  if (widthMin) return t("validation.widthMin", { min: widthMin[1] });
  const widthMax = err.match(/^Width must be at most (\d+)"$/);
  if (widthMax) return t("validation.widthMax", { max: widthMax[1] });
  return err;
}

function DealerOrderDetail() {
  const { t } = useTranslation();
  const { formatCurrency } = useFormat();
  const formatApiError = useFormatApiError();
  const { orderId } = Route.useParams();
  const [helpOpen, setHelpOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [lengthInput, setLengthInput] = useState("");
  const [breadthInput, setBreadthInput] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: order, loading, error, retry } = useAsyncData(
    () => getOrderById(orderId),
    [orderId],
  );

  if (loading) {
    return (
      <AppShell title={t("dealer.orderDetail.title")} back="/orders">
        <PageSkeleton rows={4} />
      </AppShell>
    );
  }

  if (error || !order) {
    return (
      <AppShell title={t("dealer.orderDetail.title")} back="/orders">
        <ErrorState message={error ?? t("common.orderNotFound")} onRetry={retry} />
      </AppShell>
    );
  }

  const helpOrder: DealerOrderListItem = {
    id: order.id,
    product: order.items[0]?.model ?? t("dealer.orderDetail.title"),
    // Show the custom (requested) size in summaries; pricing still uses the standard size.
    size: order.items[0]?.sizeRequested ?? order.items[0]?.size ?? "",
    thickness: order.items[0]?.thickness ?? "",
    quantity: order.totalItems,
    dealer: order.storeName ?? order.dealerName,
    status: order.status,
    placed: order.placedAt,
    amount: order.totalValue,
    step: 0,
    detail: order.items
      .map((i) => `${i.quantity} × ${i.sizeRequested ?? i.size} × ${i.thickness}`)
      .join(", "),
  };

  const status = order.status as OrderStatus;
  const totalPoints = order.items.reduce((sum, i) => sum + (i.points ?? 0), 0);
  const firstItem = order.items[0];
  const canEdit =
    status === "order_placed" || status === "pending_approval";
  const sizeMatch = (firstItem?.sizeRequested ?? firstItem?.size)?.match(
    /([\d.]+)"\s*×\s*([\d.]+)"/,
  );

  const startEdit = () => {
    if (sizeMatch) {
      setLengthInput(sizeMatch[1] ?? "");
      setBreadthInput(sizeMatch[2] ?? "");
    }
    setEditing(true);
  };

  const saveSizeChange = async () => {
    if (!firstItem?.productId) return;
    const length = parseDimensionInput(snapDimensionInput(lengthInput));
    const breadth = parseDimensionInput(snapDimensionInput(breadthInput));
    const dimensionError = getMattressDimensionError(length, breadth);
    if (dimensionError) {
      toast.error(translateMattressDimensionError(dimensionError, t));
      return;
    }
    const mapped = mapToCeilStandardSize(length, breadth);
    setSaving(true);
    try {
      await updateOrderLineItems(orderId, {
        productId: firstItem.productId,
        quantity: firstItem.quantity,
        thickness: firstItem.thickness !== "—" ? firstItem.thickness : undefined,
        lengthIn: mapped.standardLength,
        breadthIn: mapped.standardBreadth,
        campaignId: firstItem.campaignId ?? undefined,
        sizeRequested: `${length}" × ${breadth}"`,
        sizeStandard: `${mapped.standardLength}" × ${mapped.standardBreadth}"`,
      });
      toast.success(t("common.orderUpdated"));
      setEditing(false);
      retry();
    } catch (err) {
      toast.error(formatApiError(err, "common.couldNotUpdateOrder"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell title={`#${order.id}`} back="/orders">
      <div className="animate-rise space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm text-muted-foreground">
              {t("common.placedOn")} {order.placedAt}
            </p>
          </div>
          <StatusBadge kind="order" status={status} />
        </div>

        {order.items.map((item, i) => {
          const unitPrice = item.campaignPrice ?? item.dealerPrice;
          const lineMrp = item.mrp * item.quantity;
          const lineDealer = item.dealerPrice * item.quantity;
          const linePay = unitPrice * item.quantity;
          // Show the size the dealer actually requested (custom), not the standard size the
          // price is computed on. Standard is shown as secondary context when it differs.
          const requestedSize = item.sizeRequested ?? item.size;
          const standardSize = item.sizeStandard;
          const hasCustomSize = Boolean(
            requestedSize && standardSize && requestedSize !== standardSize,
          );
          const sizeLine = [requestedSize, item.thickness !== "—" ? item.thickness : null]
            .filter(Boolean)
            .join(" × ");

          return (
            <div key={i} className="rounded-3xl border border-border bg-card p-5 shadow-soft">
              <p className="font-display text-lg font-bold">{item.model}</p>
              {item.quantity > 1 && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("dealer.orderDetail.quantityLabel", { count: item.quantity })}
                </p>
              )}

              <div className="mt-4 rounded-2xl bg-secondary/60 px-4 py-4">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("common.mrp")}
                    </p>
                    <p className="font-display text-lg font-bold text-muted-foreground">
                      {formatCurrency(lineMrp)}
                    </p>
                  </div>
                  <div className="text-right">
                    {item.campaignPrice != null && item.campaignPrice < item.dealerPrice ? (
                      <>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {t("common.dealerPrice")}
                        </p>
                        <p className="font-display text-sm font-bold text-muted-foreground line-through">
                          {formatCurrency(lineDealer)}
                        </p>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {t("common.campaignPrice")}
                        </p>
                        <p className="font-display text-2xl font-bold text-primary">{formatCurrency(linePay)}</p>
                      </>
                    ) : (
                      <>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {t("common.dealerPrice")}
                        </p>
                        <p className="font-display text-2xl font-bold text-primary">{formatCurrency(lineDealer)}</p>
                      </>
                    )}
                  </div>
                </div>

                {sizeLine && (
                  <div className="mt-3">
                    <p className="text-sm font-semibold text-foreground">{sizeLine}</p>
                    {hasCustomSize && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t("dealer.orderDetail.pricedAsStandard", { size: standardSize })}
                      </p>
                    )}
                  </div>
                )}

                <p className="mt-3 flex items-center gap-1.5 text-sm font-bold text-primary">
                  <Gift className="h-4 w-4" />
                  {t("common.youllEarnPoints", { points: item.points * item.quantity })}
                </p>
              </div>

              {formatFreeItemsDisplay(item.freeItems) && (
                <p className="mt-3 text-sm text-muted-foreground">
                  {t("common.freeLabel", { items: formatFreeItemsDisplay(item.freeItems) })}
                </p>
              )}
            </div>
          );
        })}

        <OrderNotesPanel orderNotes={order.notes} items={order.items} />

        <div className="rounded-2xl border border-border bg-card px-4 py-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t("common.orderTotal")}</span>
            <span className="font-display text-lg font-bold">{formatCurrency(order.totalValue)}</span>
          </div>
          {totalPoints > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              {t("common.totalRewardPoints")}: {totalPoints}
            </p>
          )}
        </div>

        {canEdit ? (
          <div className="rounded-2xl border border-primary/30 bg-secondary/40 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-display font-bold">{t("common.changeSizeTitle")}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t("common.changeSizeDescription")}</p>
              </div>
              {!editing && (
                <button
                  type="button"
                  onClick={startEdit}
                  className="press flex shrink-0 items-center gap-1 rounded-xl border border-border bg-card px-3 py-2 text-sm font-bold"
                >
                  <Pencil className="h-4 w-4" /> {t("common.change")}
                </button>
              )}
            </div>
            {editing && (
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold">
                    {t("common.lengthInches")} ({MIN_MATTRESS_LENGTH_IN}–{MAX_MATTRESS_LENGTH_IN})
                  </label>
                  <input
                    inputMode="decimal"
                    min={MIN_MATTRESS_LENGTH_IN}
                    max={MAX_MATTRESS_LENGTH_IN}
                    value={lengthInput}
                    onChange={(e) => setLengthInput(e.target.value.replace(/[^\d.]/g, ""))}
                    onBlur={() =>
                      setLengthInput((v) =>
                        snapToCeilStandardInput(snapDimensionInput(v), LENGTHS),
                      )
                    }
                    placeholder={t("common.lengthPlaceholder")}
                    className="mt-1 h-12 w-full rounded-xl border border-input bg-card px-3 text-center font-bold"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold">
                    {t("common.widthInches")} ({MIN_MATTRESS_BREADTH_IN}–{MAX_MATTRESS_BREADTH_IN})
                  </label>
                  <input
                    inputMode="decimal"
                    min={MIN_MATTRESS_BREADTH_IN}
                    max={MAX_MATTRESS_BREADTH_IN}
                    value={breadthInput}
                    onChange={(e) => setBreadthInput(e.target.value.replace(/[^\d.]/g, ""))}
                    onBlur={() =>
                      setBreadthInput((v) =>
                        snapToCeilStandardInput(snapDimensionInput(v), BREADTHS),
                      )
                    }
                    placeholder={t("common.widthPlaceholder")}
                    className="mt-1 h-12 w-full rounded-xl border border-input bg-card px-3 text-center font-bold"
                  />
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={saveSizeChange}
                  className="press col-span-2 rounded-xl brand-gradient py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
                >
                  {saving ? t("common.saving") : t("common.saveNewSize")}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
            {t("common.cannotChangeOnline")}
          </div>
        )}

        {order.customerName && (
          <div className="rounded-2xl border border-border bg-card p-4 text-sm">
            <p className="font-semibold text-muted-foreground">{t("common.customer")}</p>
            <p className="mt-1 font-bold">{order.customerName}</p>
            {order.customerPhone && (
              <p className="text-muted-foreground">{order.customerPhone}</p>
            )}
          </div>
        )}

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
          {helpOpen ? t("common.closeHelp") : t("common.needHelp")}
        </button>

        {helpOpen && <OrderHelpPanel order={helpOrder} allowOrderLookup />}

        <Link
          to="/complaints"
          className="press block rounded-2xl border border-border bg-secondary py-3 text-center text-sm font-bold"
        >
          {t("common.viewAllHelpRequests")}
        </Link>
      </div>
    </AppShell>
  );
}
