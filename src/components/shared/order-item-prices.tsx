import { useTranslation } from "react-i18next";
import { useFormat } from "@/hooks/use-format";
import { useSession } from "@/hooks/use-session";
import type { DistributorOrderItem } from "@/lib/mock/distributor/types";

export function orderUnitPriceForRole(item: DistributorOrderItem, role: string | undefined) {
  if (role === "distributor") return Number(item.distributorPrice ?? item.dealerPrice ?? 0);
  return Number(item.campaignPrice ?? item.dealerPrice ?? 0);
}

export function OrderItemPriceLines({ item }: { item: DistributorOrderItem }) {
  const { t } = useTranslation();
  const { formatCurrency } = useFormat();
  const { role } = useSession();
  const isAdmin = role === "master_admin" || role === "admin_staff";
  const isDistributor = role === "distributor";

  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <span className="text-muted-foreground">
        {t("common.mrp")}: {formatCurrency(item.mrp)}
      </span>
      {(isAdmin || role === "dealer" || role === "sales_executive") && (
        <span className={item.campaignPrice != null && item.campaignPrice < item.dealerPrice ? "text-muted-foreground line-through" : "font-bold text-primary"}>
          {t("common.dealerPrice")}: {formatCurrency(item.dealerPrice)}
        </span>
      )}
      {item.campaignPrice != null && item.campaignPrice < item.dealerPrice && !isDistributor && (
        <span className="font-bold text-primary">
          {t("common.campaignPrice")}: {formatCurrency(item.campaignPrice)}
        </span>
      )}
      {(isAdmin || isDistributor) && item.distributorMarginPercent != null && (
        <span className="text-muted-foreground">
          {t("common.distributorMargin")}: {Number(item.distributorMarginPercent)}%
        </span>
      )}
      {(isAdmin || isDistributor) && item.distributorPrice != null && (
        <span className="font-bold text-primary">
          {t("common.distributorPrice")}: {formatCurrency(item.distributorPrice)}
        </span>
      )}
    </div>
  );
}
