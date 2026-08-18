import { createFileRoute } from "@tanstack/react-router";
import { DistributorShell } from "@/components/distributor-shell";
import { CampaignCard } from "@/components/shared/campaign-card";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/shared/states";
import { useAsyncData } from "@/hooks/use-async-data";
import { getCampaigns } from "@/services/campaigns";

export const Route = createFileRoute("/distributor/campaigns/")({
  component: CampaignsPage,
});

function CampaignsPage() {
  const simulateError =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("error") === "1";

  const { data, loading, error, retry } = useAsyncData(
    () => getCampaigns(simulateError),
    [simulateError],
  );

  return (
    <DistributorShell title="Campaigns" back="/distributor/more" showBell={false}>
      {loading && <PageSkeleton rows={3} />}
      {error && <ErrorState message={error} onRetry={retry} />}
      {!loading && !error && data?.length === 0 && (
        <EmptyState title="No campaigns" description="Active campaigns will appear here." />
      )}
      {!loading && !error && data && data.length > 0 && (
        <div className="space-y-3">
          {data.map((c) => (
            <CampaignCard key={c.id} campaign={c} />
          ))}
        </div>
      )}
    </DistributorShell>
  );
}
