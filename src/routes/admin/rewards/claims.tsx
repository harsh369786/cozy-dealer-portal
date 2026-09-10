import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
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
import { useRewardClaimStatusLabel, REWARD_CLAIM_STATUS_STYLES } from "@/lib/i18n-labels";
import { normalizeRewardClaimStatus } from "../../../../shared/reward-claim-status";
import { listRewardClaims, transitionRewardClaim } from "@/services/reward-claims";
import {
  deleteSystemNotification,
  listSystemNotifications,
  updateSystemNotification,
} from "@/services/admin/system-notifications";

export const Route = createFileRoute("/admin/rewards/claims")({
  component: RewardClaimsPage,
});

const STATUS_TABS = [
  "all",
  "pending_approval",
  "approved",
  "processing",
  "dispatched_from_factory",
  "delivered",
  "rejected",
] as const;

function RewardClaimsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { can } = useAdminPermissions();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<(typeof STATUS_TABS)[number]>("all");
  const [page, setPage] = useState(1);
  const [loadingAction, setLoadingAction] = useState(false);
  const [processId, setProcessId] = useState<string | null>(null);
  const [dispatchId, setDispatchId] = useState<string | null>(null);
  const [editNotif, setEditNotif] = useState<{ id: string; title: string; body: string } | null>(null);
  const [deleteNotifId, setDeleteNotifId] = useState<string | null>(null);

  const canProcess = can("rewards:process");

  const notifQuery = useAsyncData(async () => {
    try {
      return await listSystemNotifications("system");
    } catch {
      return [];
    }
  }, []);

  const { data, loading, error, retry } = useAsyncData(
    () => listRewardClaims({ search, status: status === "all" ? "all" : status, page, pageSize: 10 }),
    [search, status, page],
  );

  const advance = async (id: string, to: "processing" | "dispatched_from_factory", clear: () => void) => {
    setLoadingAction(true);
    try {
      await transitionRewardClaim(id, to);
      toast.success(t("common.statusUpdated"));
      clear();
      retry();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("errors.saveFailed"));
    } finally {
      setLoadingAction(false);
    }
  };

  if (loading && !data) return <PageSkeleton rows={4} />;
  if (error && !data) return <ErrorState message={error ?? "Failed to load claims"} onRetry={retry} />;

  return (
    <div>
      <AdminPageHeader
        title={t("admin.rewards.claims")}
        description={t("admin.rewards.claimsDescription")}
        actions={
          <Link to="/admin/rewards">
            <Button variant="outline" className="rounded-lg font-bold">← {t("admin.rewards.title")}</Button>
          </Link>
        }
      />

      <AdminFiltersBar
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
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
          tabs={STATUS_TABS.map((s) => ({ value: s, label: s === "all" ? t("common.all") : REWARD_CLAIM_STATUS_LABEL(s) }))}
        />
      </AdminFiltersBar>

      <AdminDataTable
        data={data?.items ?? []}
        keyFn={(c) => c.id}
        onRowClick={(c) => navigate({ to: "/admin/rewards/claims/$claimId", params: { claimId: c.id } })}
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
            cell: (c) => <ClaimStatusBadge status={c.status} />,
          },
          {
            key: "action",
            header: "",
            cell: (c) => {
              if (!canProcess) return null;
              const s = normalizeRewardClaimStatus(c.status);
              // Admin staff processes an approved claim then dispatches it from the factory.
              if (s === "approved") {
                return (
                  <Button
                    size="sm"
                    className="rounded-lg font-bold"
                    onClick={(e) => {
                      e.stopPropagation();
                      setProcessId(c.id);
                    }}
                  >
                    {t("admin.rewards.markProcessing")}
                  </Button>
                );
              }
              if (s === "processing") {
                return (
                  <Button
                    size="sm"
                    className="rounded-lg font-bold"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDispatchId(c.id);
                    }}
                  >
                    {t("admin.rewards.markDispatched")}
                  </Button>
                );
              }
              return null;
            },
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
        open={!!processId}
        onOpenChange={(o) => !o && setProcessId(null)}
        title={t("admin.rewards.markProcessing")}
        description={t("admin.rewards.markProcessingDesc")}
        confirmLabel={t("admin.rewards.markProcessing")}
        loading={loadingAction}
        onConfirm={() => processId && advance(processId, "processing", () => setProcessId(null))}
      />

      <ConfirmActionDialog
        open={!!dispatchId}
        onOpenChange={(o) => !o && setDispatchId(null)}
        title={t("admin.rewards.markDispatched")}
        description={t("admin.rewards.markDispatchedDesc")}
        confirmLabel={t("admin.rewards.markDispatched")}
        loading={loadingAction}
        onConfirm={() => dispatchId && advance(dispatchId, "dispatched_from_factory", () => setDispatchId(null))}
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
                  toast.error(e instanceof Error ? e.message : t("errors.saveFailed"));
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
            toast.error(e instanceof Error ? e.message : t("errors.saveFailed"));
          } finally {
            setLoadingAction(false);
          }
        }}
      />
    </div>
  );
}

function ClaimStatusBadge({ status }: { status: string }) {
  const s = normalizeRewardClaimStatus(status);
  const label = useRewardClaimStatusLabel(s);
  return (
    <Badge className={`${REWARD_CLAIM_STATUS_STYLES[s]} border-0 font-bold`}>{label}</Badge>
  );
}

// Non-hook English fallback for the filter tab labels (AdminFilterTabs takes plain strings).
import { REWARD_CLAIM_STATUS_LABELS } from "../../../../shared/reward-claim-status";
function REWARD_CLAIM_STATUS_LABEL(status: string): string {
  const s = normalizeRewardClaimStatus(status);
  return REWARD_CLAIM_STATUS_LABELS[s];
}
