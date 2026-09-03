import { useTranslation } from "react-i18next";
import { StatusBadge } from "@/components/shared/status-badge";
import { useFormat } from "@/hooks/use-format";
import type { DistributorOrder } from "@/lib/mock/distributor/types";
import type { OrderStatus } from "@/lib/mock/distributor/types";
import { OrderItemPriceLines, orderUnitPriceForRole } from "@/components/shared/order-item-prices";
import { useSession } from "@/hooks/use-session";
import { cn } from "@/lib/utils";

/**
 * Read-only summary of an order — number, date, status, and each line item with
 * model, size × thickness, quantity (in pieces), and pricing. Reused wherever a full
 * order needs to be shown (complaint tracking, complaint creation, etc.).
 */
export function OrderSummaryCard({
  order,
  className,
}: {
  order: DistributorOrder;
  className?: string;
}) {
  const { t } = useTranslation();
  const { formatCurrency } = useFormat();
  const { role } = useSession();

  return (
    <div className={cn("rounded-2xl border border-border bg-card p-4 shadow-soft", className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display text-base font-bold">
            {t("common.orderHash", { orderId: order.id })}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("common.placedOn")} {order.placedAt}
          </p>
        </div>
        <StatusBadge kind="order" status={order.status as OrderStatus} />
      </div>

      <div className="mt-3 space-y-3">
        {order.items.map((item, i) => {
          const sizeLine = [item.size, item.thickness && item.thickness !== "—" ? item.thickness : null]
            .filter(Boolean)
            .join(" × ");
          const unitPrice = orderUnitPriceForRole(item, role);
          return (
            <div
              key={i}
              className="rounded-xl border border-border/60 bg-secondary/30 p-3 first:mt-0"
            >
              <p className="font-semibold">{item.model}</p>
              {sizeLine && <p className="mt-0.5 text-sm text-muted-foreground">{sizeLine}</p>}
              <p className="mt-0.5 text-sm font-semibold text-foreground">
                {t("common.quantityPieces", { count: item.quantity })}
              </p>
              <OrderItemPriceLines item={item} />
              <p className="mt-1 text-sm font-bold">{formatCurrency(unitPrice * item.quantity)}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-3 text-sm">
        <span className="text-muted-foreground">{t("common.orderTotal")}</span>
        <span className="font-display text-base font-bold">
          {formatCurrency(role === "distributor" && order.distributorTotalValue ? order.distributorTotalValue : order.totalValue)}
        </span>
      </div>
    </div>
  );
}
