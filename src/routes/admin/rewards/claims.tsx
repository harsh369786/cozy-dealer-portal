import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AdminDataTable } from "@/components/admin/admin-data-table";
import { AdminFilterTabs, AdminFiltersBar } from "@/components/admin/admin-filters-bar";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { ConfirmActionDialog } from "@/components/shared/dialogs";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAsyncData } from "@/hooks/use-async-data";
import { listRewardClaims, markClaimDelivered } from "@/services/admin/rewards";

export const Route = createFileRoute("/admin/rewards/claims")({
  component: RewardClaimsPage,
});

function RewardClaimsPage() {
  const [status, setStatus] = useState<"all" | "pending" | "delivered">("all");
  const [page, setPage] = useState(1);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState(false);

  const { data, loading, error, retry } = useAsyncData(
    () => listRewardClaims({ status, page, pageSize: 10 }),
    [status, page],
  );

  const handleDeliver = async () => {
    if (!confirmId) return;
    setLoadingAction(true);
    try {
      await markClaimDelivered(confirmId);
      toast.success("Marked as delivered");
      setConfirmId(null);
      retry();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setLoadingAction(false);
    }
  };

  if (loading) return <PageSkeleton rows={4} />;
  if (error || !data) return <ErrorState message={error ?? "Failed to load claims"} onRetry={retry} />;

  return (
    <div>
      <AdminPageHeader
        title="Reward claims"
        description="Track redemption and delivery status."
        actions={
          <Link to="/admin/rewards">
            <Button variant="outline" className="rounded-2xl font-bold">← Catalogue</Button>
          </Link>
        }
      />

      <AdminFiltersBar>
        <AdminFilterTabs
          value={status}
          onChange={(v) => { setStatus(v as typeof status); setPage(1); }}
          tabs={[
            { value: "all", label: "All" },
            { value: "pending", label: "Pending" },
            { value: "delivered", label: "Delivered" },
          ]}
        />
      </AdminFiltersBar>

      <AdminDataTable
        data={data.items}
        keyFn={(c) => c.id}
        emptyTitle="No claims found"
        columns={[
          { key: "dealer", header: "Dealer", cell: (c) => c.dealerName },
          {
            key: "reward",
            header: "Reward",
            cell: (c) => (
              <span>
                {c.emoji} {c.rewardName}
              </span>
            ),
          },
          { key: "points", header: "Points", cell: (c) => c.points.toLocaleString("en-IN") },
          {
            key: "status",
            header: "Status",
            cell: (c) => (
              <Badge variant={c.status === "delivered" ? "secondary" : "default"} className="capitalize">
                {c.status}
              </Badge>
            ),
          },
          {
            key: "action",
            header: "",
            cell: (c) =>
              c.status === "pending" ? (
                <Button size="sm" className="rounded-xl font-bold" onClick={() => setConfirmId(c.id)}>
                  Mark delivered
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">{c.deliveredAt ?? "—"}</span>
              ),
          },
        ]}
      />

      <AdminPagination page={data.page} totalPages={data.totalPages} onPageChange={setPage} />

      <ConfirmActionDialog
        open={!!confirmId}
        onOpenChange={(o) => !o && setConfirmId(null)}
        title="Mark as delivered?"
        description="Confirm that this reward has been delivered to the dealer."
        confirmLabel="Mark delivered"
        onConfirm={handleDeliver}
        loading={loadingAction}
      />
    </div>
  );
}
