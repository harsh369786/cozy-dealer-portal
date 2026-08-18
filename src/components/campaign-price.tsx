import { inr } from "@/lib/demo-data";
import { cn } from "@/lib/utils";

type CampaignPriceBlockProps = {
  mrp: number;
  dealerPrice: number;
  campaignPrice?: number;
  qty?: number;
  compact?: boolean;
  className?: string;
};

export function CampaignPriceBlock({
  mrp,
  dealerPrice,
  campaignPrice,
  qty = 1,
  compact = false,
  className,
}: CampaignPriceBlockProps) {
  const mrpTotal = mrp * qty;
  const dealerTotal = dealerPrice * qty;
  const campaignTotal = campaignPrice != null ? campaignPrice * qty : null;
  const hasCampaign = campaignTotal != null;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">MRP</span>
        <span className="text-muted-foreground">{inr(mrpTotal)}</span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className={cn(hasCampaign && "text-muted-foreground")}>Dealer Price</span>
        <span
          className={cn(
            "font-semibold",
            hasCampaign && "text-muted-foreground line-through",
            !hasCampaign && "font-display text-xl font-bold text-primary",
          )}
        >
          {inr(dealerTotal)}
        </span>
      </div>
      {hasCampaign && (
        <div className="flex items-end justify-between border-t border-border/60 pt-2">
          <span className="text-base font-bold">Campaign Price</span>
          <span
            className={cn("font-display font-bold text-primary", compact ? "text-2xl" : "text-3xl")}
          >
            {inr(campaignTotal)}
          </span>
        </div>
      )}
    </div>
  );
}

export function CampaignBadge({ label }: { label: string }) {
  return (
    <div className="animate-rise rounded-2xl border border-primary/40 bg-secondary px-4 py-3 text-center">
      <p className="text-sm font-bold text-primary">🔥 SPECIAL CAMPAIGN PRICE</p>
      <p className="mt-0.5 text-xs font-semibold text-muted-foreground">{label}</p>
    </div>
  );
}
