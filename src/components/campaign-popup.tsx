import { Link } from "@tanstack/react-router";
import { X } from "lucide-react";
import type { PriceCampaign } from "@/lib/campaign-service";
import { formatCampaignDate } from "@/lib/campaign-service";
import { getProduct } from "@/lib/demo-data";
import { markCampaignSeen } from "@/lib/notifications";

type CampaignPopupProps = {
  campaign: PriceCampaign;
  onDismiss: () => void;
};

export function CampaignPopup({ campaign, onDismiss }: CampaignPopupProps) {
  const product = getProduct(campaign.productId);

  const dismiss = () => {
    markCampaignSeen(campaign.id);
    onDismiss();
  };

  const viewCampaign = () => {
    markCampaignSeen(campaign.id);
    onDismiss();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/50 p-5 backdrop-blur-sm">
      <div className="animate-pop relative w-full max-w-[380px] overflow-hidden rounded-3xl border border-border bg-card shadow-lift">
        <button
          onClick={dismiss}
          aria-label="Close"
          className="press absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-secondary"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="brand-gradient px-6 py-8 text-center text-primary-foreground">
          <p className="text-3xl">🔥</p>
          <p className="mt-2 font-display text-xl font-bold">New Campaign Live!</p>
          <p className="mt-1 text-sm font-semibold opacity-90">{campaign.name}</p>
        </div>

        <div className="p-6 text-center">
          <p className="font-display text-2xl font-bold">{product.name} Mattress</p>
          <p className="mt-2 text-lg font-bold text-primary">{campaign.badgeLabel}</p>
          <p className="mt-3 text-sm text-muted-foreground">
            Valid until {formatCampaignDate(campaign.endAt)}
          </p>

          <Link
            to="/products/$productId"
            params={{ productId: campaign.productId }}
            onClick={viewCampaign}
            className="press mt-6 block rounded-2xl brand-gradient py-4 text-base font-bold text-primary-foreground"
          >
            View Campaign
          </Link>
          <button
            onClick={dismiss}
            className="press mt-3 w-full py-3 text-sm font-bold text-muted-foreground"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
