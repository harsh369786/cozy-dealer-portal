import { useTranslation } from "react-i18next";
import { useFormat } from "@/hooks/use-format";
import { cn } from "@/lib/utils";

type CampaignPriceBlockProps = {
  mrp: number;
  dealerPrice: number;
  campaignPrice?: number;
  discountPercent?: number | null;
  qty?: number;
  compact?: boolean;
  className?: string;
  /**
   * When true, the final price is shown as a "From ..." starting price. Use this wherever the
   * numbers are the BASE 72"×36", 5" price (e.g. home/catalog previews) because the real charge
   * scales with the size and thickness chosen on the product page. Defaults to false so the
   * product-page usage (which already reflects the exact chosen config) is unchanged.
   */
  isFromPrice?: boolean;
};

export function CampaignPriceBlock({
  mrp,
  dealerPrice,
  campaignPrice,
  discountPercent,
  qty = 1,
  compact = false,
  className,
  isFromPrice = false,
}: CampaignPriceBlockProps) {
  const { t } = useTranslation();
  const { formatCurrency } = useFormat();
  const mrpTotal = mrp * qty;
  const dealerTotal = dealerPrice * qty;
  const campaignTotal = campaignPrice != null ? campaignPrice * qty : null;
  // Only treat it as a campaign when it actually reduces the dealer price, so a 0%
  // (or non-discounting) campaign never strikes through the price or shows "0% off".
  const hasCampaign = campaignPrice != null && campaignPrice < dealerPrice;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{t("common.mrp")}</span>
        <span className="text-muted-foreground">{formatCurrency(mrpTotal)}</span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className={cn(hasCampaign && "text-muted-foreground")}>{t("common.dealerPrice")}</span>
        <span
          className={cn(
            "font-semibold",
            hasCampaign && "text-muted-foreground line-through",
            !hasCampaign && "font-display text-xl font-bold text-primary",
          )}
        >
          {formatCurrency(dealerTotal)}
        </span>
      </div>
      {hasCampaign && discountPercent != null && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{t("common.campaignDiscount")}</span>
          <span className="font-semibold text-primary">{discountPercent}%</span>
        </div>
      )}
      {hasCampaign && (
        <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-2">
          <span className="text-base font-bold">{t("common.finalDiscountedPrice")}</span>
          {/* Right-aligned price column. The "From" prefix is a small caption ABOVE the amount so
              the big number always stays flush-right and its baseline never shifts, instead of the
              old inline "From ₹4,600" that rendered ragged/left-leaning on narrow cards. */}
          <span className="flex shrink-0 flex-col items-end leading-tight">
            {isFromPrice && (
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t("common.from")}
              </span>
            )}
            <span
              className={cn(
                "font-display font-bold text-primary",
                compact ? "text-2xl" : "text-3xl",
              )}
            >
              {formatCurrency(campaignTotal!)}
            </span>
          </span>
        </div>
      )}
    </div>
  );
}

export function CampaignBadge({ label }: { label: string }) {
  const { t } = useTranslation();
  return (
    <div className="animate-rise rounded-2xl border border-primary/40 bg-secondary px-4 py-3 text-center">
      <p className="text-sm font-bold text-primary">{t("common.campaignDiscountBadge")}</p>
      <p className="mt-0.5 text-xs font-semibold text-muted-foreground">{label}</p>
    </div>
  );
}
