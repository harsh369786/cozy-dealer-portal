import { createFileRoute } from "@tanstack/react-router";
import { DistributorShell } from "@/components/distributor-shell";
import { StatusBadge } from "@/components/shared/status-badge";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { useAsyncData } from "@/hooks/use-async-data";
import { formatCampaignDate } from "@/lib/campaign-service";
import { getCampaignById } from "@/services/campaigns";

export const Route = createFileRoute("/distributor/campaigns/$campaignId")({
  component: CampaignDetailPage,
});

function CampaignDetailPage() {
  const { campaignId } = Route.useParams();
  const { data, loading, error, retry } = useAsyncData(
    () => getCampaignById(campaignId),
    [campaignId],
  );

  if (loading) {
    return (
      <DistributorShell title="Campaign" back="/distributor/campaigns" showBell={false}>
        <PageSkeleton rows={3} />
      </DistributorShell>
    );
  }

  if (error || !data) {
    return (
      <DistributorShell title="Campaign" back="/distributor/campaigns" showBell={false}>
        <ErrorState message={error ?? "Campaign not found"} onRetry={retry} />
      </DistributorShell>
    );
  }

  return (
    <DistributorShell title={data.name} back="/distributor/campaigns" showBell={false}>
      <div className="animate-rise space-y-4">
        {data.imageUrl && (
          <img
            src={data.imageUrl}
            alt={data.name}
            className="w-full rounded-3xl border border-border object-cover"
          />
        )}
        <div className="flex items-start justify-between gap-3">
          <span className="text-4xl">{data.bannerEmoji}</span>
          <StatusBadge kind="campaign" status={data.status} />
        </div>
        <p className="font-display text-xl font-bold">{data.product}</p>
        <p className="text-lg font-semibold text-primary">{data.discountLabel}</p>
        <p className="text-muted-foreground">{data.description}</p>
        <div className="rounded-3xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Duration</p>
          <p className="font-semibold">
            {formatCampaignDate(data.startDate)} — {formatCampaignDate(data.endDate)}
          </p>
          {data.applicableDealers && (
            <p className="mt-3 text-sm text-muted-foreground">
              Limited to {data.applicableDealers.length} selected dealers.
            </p>
          )}
        </div>
        {data.productId && data.status === "active" && (
          <p className="rounded-2xl border border-primary/20 bg-secondary/40 p-4 text-sm font-semibold text-muted-foreground">
            Dealers ordering {data.product} during this campaign see the offer highlighted in the
            app.
          </p>
        )}
      </div>
    </DistributorShell>
  );
}
