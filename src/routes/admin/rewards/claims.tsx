import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AdminDataTable } from "@/components/admin/admin-data-table";
import { AdminFilterTabs, AdminFiltersBar } from "@/components/admin/admin-filters-bar";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminSection } from "@/components/admin/admin-section";
import { useAdminPermissions } from "@/hooks/use-admin-permissions";
import { ConfirmActionDialog } from "@/components/shared/dialogs";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAsyncData } from "@/hooks/use-async-data";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  listRewardClaims,
  markClaimDelivered,
  markClaimPending,
  undoRewardClaim,
} from "@/services/admin/rewards";
import {
  deleteSystemNotification,
  listSystemNotifications,
  updateSystemNotification,
} from "@/services/admin/system-notifications";

export const Route = createFileRoute("/admin/rewards/claims")({
  component: RewardClaimsPage,
});

function RewardClaimsPage() {
  const { can } = useAdminPermissions();
  const [searchInput, setSearchInput] = useState("");
  const search = useDebouncedValue(searchInput, 350);
  const [status, setStatus] = useState<"all" | "pending" | "delivered">("all");
  const [page, setPage] = useState(1);
  const [deliverId, setDeliverId] = useState<string | null>(null);
  const [undoId, setUndoId] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState(false);
  const [editNotif, setEditNotif] = useState<{ id: string; title: string; body: string } | null>(null);
  const [deleteNotifId, setDeleteNotifId] = useState<string | null>(null);

  const notifQuery = useAsyncData(() => listSystemNotifications("system"), []);

  const { data, loading, error, retry } = useAsyncData(
    () => listRewardClaims({ search, status, page, pageSize: 10 }),
    [search, status, page],
  );

  const handleDeliver = async () => {
    if (!deliverId) return;
    setLoadingAction(true);
    try {
      await markClaimDelivered(deliverId);
      toast.success("Marked as delivered");
      setDeliverId(null);
      retry();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setLoadingAction(false);
    }
  };

  const handleUndo = async () => {
    if (!undoId) return;
    setLoadingAction(true);
    try {
      const res = await undoRewardClaim(undoId);
      toast.success(`${res.pointsReturned.toLocaleString("en-IN")} points returned to dealer`);
      setUndoId(null);
      retry();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Undo failed");
    } finally {
      setLoadingAction(false);
    }
  };

  if (loading && !data) return <PageSkeleton rows={4} />;
  if (error && !data) return <ErrorState message={error ?? "Failed to load claims"} onRetry={retry} />;

  return (
    <div>
      <AdminPageHeader
        title="Reward claims"
        description="Redeemed rewards — pending delivery and completed claims."
        actions={
          <Link to="/admin/rewards">
            <Button variant="outline" className="rounded-lg font-bold">← Catalogue</Button>
          </Link>
        }
      />

      <AdminFiltersBar
        search={searchInput}
        onSearchChange={(v) => {
          setSearchInput(v);
          setPage(1);
        }}
        searchPlaceholder="Search by dealer or reward…"
      >
        <AdminFilterTabs
          value={status}
          onChange={(v) => {
            setStatus(v as typeof status);
            setPage(1);
          }}
          tabs={[
            { value: "all", label: "All claims" },
            { value: "pending", label: "Pending" },
            { value: "delivered", label: "Delivered" },
          ]}
        />
      </AdminFiltersBar>

      <AdminDataTable
        data={data?.items ?? []}
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
            cell: (c) => (
              <div className="flex flex-wrap gap-1">
                {c.status === "pending" ? (
                  <Button size="sm" className="rounded-lg font-bold" onClick={() => setDeliverId(c.id)}>
                    Mark delivered
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-lg font-bold"
                    onClick={() => void markClaimPending(c.id).then(retry)}
                  >
                    Mark pending
                  </Button>
                )}
                {can("catalog:write") && (
                  <Button
                    size="sm"
                    variant="destructive"
                    className="rounded-lg font-bold"
                    onClick={() => setUndoId(c.id)}
                  >
                    Undo claim
                  </Button>
                )}
              </div>
            ),
          },
        ]}
      />

      {data && <AdminPagination page={data.page} totalPages={data.totalPages} onPageChange={setPage} />}

      <AdminSection title="Claim notifications" description="Edit or remove reward-claim alerts sent to admins.">
        <div className="space-y-2">
          {(notifQuery.data ?? [])
            .filter((n) => n.title.toLowerCase().includes("reward claim"))
            .slice(0, 10)
            .map((n) => (
              <div key={n.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                <div>
                  <p className="font-bold">{n.title}</p>
                  <p className="text-muted-foreground">{n.body}</p>
                </div>
                {can("settings:write") && (
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-lg"
                      onClick={() => setEditNotif({ id: n.id, title: n.title, body: n.body })}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="rounded-lg"
                      onClick={() => setDeleteNotifId(n.id)}
                    >
                      Delete
                    </Button>
                  </div>
                )}
              </div>
            ))}
          {notifQuery.data?.filter((n) => n.title.toLowerCase().includes("reward claim")).length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">No claim notifications yet.</p>
          )}
        </div>
      </AdminSection>

      <ConfirmActionDialog
        open={!!deliverId}
        onOpenChange={(o) => !o && setDeliverId(null)}
        title="Mark as delivered?"
        description="Confirm that this reward has been delivered to the dealer."
        confirmLabel="Mark delivered"
        onConfirm={handleDeliver}
        loading={loadingAction}
      />

      <ConfirmActionDialog
        open={!!undoId}
        onOpenChange={(o) => !o && setUndoId(null)}
        title="Undo this claim?"
        description="Points will be returned to the dealer and the claim will be removed."
        confirmLabel="Undo claim"
        onConfirm={handleUndo}
        loading={loadingAction}
        variant="destructive"
      />

      <Dialog open={!!editNotif} onOpenChange={(o) => !o && setEditNotif(null)}>
        <DialogContent className="rounded-xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit notification</DialogTitle>
          </DialogHeader>
          {editNotif && (
            <div className="space-y-3">
              <div>
                <Label>Title</Label>
                <Input
                  value={editNotif.title}
                  onChange={(e) => setEditNotif({ ...editNotif, title: e.target.value })}
                  className="mt-1 rounded-lg"
                />
              </div>
              <div>
                <Label>Body</Label>
                <Textarea
                  value={editNotif.body}
                  onChange={(e) => setEditNotif({ ...editNotif, body: e.target.value })}
                  className="mt-1 min-h-24 rounded-lg"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="rounded-lg" onClick={() => setEditNotif(null)}>
              Cancel
            </Button>
            <Button
              className="rounded-lg"
              disabled={loadingAction}
              onClick={async () => {
                if (!editNotif) return;
                setLoadingAction(true);
                try {
                  await updateSystemNotification(editNotif.id, {
                    title: editNotif.title,
                    body: editNotif.body,
                  });
                  toast.success("Notification updated");
                  setEditNotif(null);
                  notifQuery.retry();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Update failed");
                } finally {
                  setLoadingAction(false);
                }
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={!!deleteNotifId}
        onOpenChange={(o) => !o && setDeleteNotifId(null)}
        title="Delete notification?"
        description="This removes the alert permanently."
        confirmLabel="Delete"
        variant="destructive"
        loading={loadingAction}
        onConfirm={async () => {
          if (!deleteNotifId) return;
          setLoadingAction(true);
          try {
            await deleteSystemNotification(deleteNotifId);
            toast.success("Notification deleted");
            setDeleteNotifId(null);
            notifQuery.retry();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Delete failed");
          } finally {
            setLoadingAction(false);
          }
        }}
      />
    </div>
  );
}
