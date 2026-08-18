import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type { DistributorCampaign } from "@/lib/mock/distributor/types";
import { StatusBadge } from "./status-badge";

export function CampaignCard({ campaign }: { campaign: DistributorCampaign }) {
  return (
    <Link
      to="/distributor/campaigns/$campaignId"
      params={{ campaignId: campaign.id }}
      className="press block rounded-3xl border border-border bg-card p-4 shadow-soft"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-3">
          <span className="text-2xl">{campaign.bannerEmoji}</span>
          <div className="min-w-0">
            <p className="truncate font-display font-bold">{campaign.name}</p>
            <p className="text-sm text-muted-foreground">{campaign.product}</p>
          </div>
        </div>
        <StatusBadge kind="campaign" status={campaign.status} />
      </div>
      <p className="mt-2 text-sm font-semibold text-primary">{campaign.discountLabel}</p>
      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{campaign.description}</p>
      <p className="mt-2 text-xs text-muted-foreground">
        {campaign.startDate} — {campaign.endDate}
      </p>
      <div className="mt-2 flex items-center justify-end text-xs font-semibold text-primary">
        View campaign <ChevronRight className="h-4 w-4" />
      </div>
    </Link>
  );
}
