import { createFileRoute } from "@tanstack/react-router";
import { DistributorShell } from "@/components/distributor-shell";
import { DealerCard } from "@/components/shared/dealer-card";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/shared/states";
import { useAsyncData } from "@/hooks/use-async-data";
import { getDealers } from "@/services/dealers";

export const Route = createFileRoute("/distributor/dealers/")({
  component: DealersPage,
});

function DealersPage() {
  const simulateError =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("error") === "1";

  const { data, loading, error, retry } = useAsyncData(
    () => getDealers(simulateError),
    [simulateError],
  );

  return (
    <DistributorShell title="My Dealers">
      {loading && <PageSkeleton rows={4} />}
      {error && <ErrorState message={error} onRetry={retry} />}
      {!loading && !error && data?.length === 0 && (
        <EmptyState
          title="No dealers assigned"
          description="Dealers in your territory will appear here."
        />
      )}
      {!loading && !error && data && data.length > 0 && (
        <div className="space-y-3">
          {data.map((dealer) => (
            <DealerCard key={dealer.id} dealer={dealer} />
          ))}
        </div>
      )}
    </DistributorShell>
  );
}
