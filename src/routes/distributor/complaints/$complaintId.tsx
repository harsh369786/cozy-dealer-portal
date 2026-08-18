import { createFileRoute } from "@tanstack/react-router";
import { DistributorShell } from "@/components/distributor-shell";
import { StatusBadge } from "@/components/shared/status-badge";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { useAsyncData } from "@/hooks/use-async-data";
import { getComplaintById } from "@/services/complaints";

export const Route = createFileRoute("/distributor/complaints/$complaintId")({
  component: ComplaintDetailPage,
});

function ComplaintDetailPage() {
  const { complaintId } = Route.useParams();
  const { data, loading, error, retry } = useAsyncData(
    () => getComplaintById(complaintId),
    [complaintId],
  );

  if (loading) {
    return (
      <DistributorShell title="Complaint" back="/distributor/complaints" showBell={false}>
        <PageSkeleton rows={3} />
      </DistributorShell>
    );
  }

  if (error || !data) {
    return (
      <DistributorShell title="Complaint" back="/distributor/complaints" showBell={false}>
        <ErrorState message={error ?? "Complaint not found"} onRetry={retry} />
      </DistributorShell>
    );
  }

  return (
    <DistributorShell title={data.id} back="/distributor/complaints" showBell={false}>
      <div className="animate-rise space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold">{data.dealerName}</p>
            <p className="text-sm text-muted-foreground">Order {data.orderId}</p>
          </div>
          <StatusBadge kind="complaint" status={data.status} />
        </div>

        <div className="rounded-3xl border border-border bg-card p-4 shadow-soft">
          <p className="text-sm font-semibold text-muted-foreground">Category</p>
          <p className="font-semibold">{data.category}</p>
          <p className="mt-4 text-sm font-semibold text-muted-foreground">Description</p>
          <p className="mt-1">{data.description}</p>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground">Created</p>
              <p className="font-semibold">{data.createdAt}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Updated</p>
              <p className="font-semibold">{data.updatedAt}</p>
            </div>
          </div>
        </div>

        <p className="rounded-2xl bg-secondary/60 p-4 text-sm text-muted-foreground">
          Status updates are handled by admin staff. Distributors have read-only access.
        </p>
      </div>
    </DistributorShell>
  );
}
