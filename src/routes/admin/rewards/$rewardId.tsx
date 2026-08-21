import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { ConfirmActionDialog } from "@/components/shared/dialogs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { useAsyncData } from "@/hooks/use-async-data";
import { useAdminPermissions } from "@/hooks/use-admin-permissions";
import { deleteRewardItem, getRewardItem, saveRewardItem } from "@/services/admin/rewards";
import { RewardEditor } from "./new";

export const Route = createFileRoute("/admin/rewards/$rewardId")({
  component: EditRewardPage,
});

function EditRewardPage() {
  const { rewardId } = Route.useParams();
  const navigate = useNavigate();
  const { can } = useAdminPermissions();
  const [local, setLocal] = useState<Awaited<ReturnType<typeof getRewardItem>>>(null);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { loading, error, retry } = useAsyncData(async () => {
    const item = await getRewardItem(rewardId);
    setLocal(item);
    return item;
  }, [rewardId]);

  const readOnly = !can("catalog:write");

  const handleSave = async () => {
    if (!local) return;
    if (!local.name.trim()) {
      toast.error("Reward name is required");
      return;
    }
    if (local.pointsRequired < 1) {
      toast.error("Points must be at least 1");
      return;
    }
    setSaving(true);
    try {
      await saveRewardItem(local);
      toast.success("Reward saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteRewardItem(rewardId);
      toast.success("Reward deleted");
      navigate({ to: "/admin/rewards" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  if (loading) return <PageSkeleton rows={3} />;
  if (error || !local) return <ErrorState message={error ?? "Reward not found"} onRetry={retry} />;

  return (
    <div>
      <AdminPageHeader
        title={local.name}
        description={`${local.pointsRequired.toLocaleString("en-IN")} points`}
        actions={
          <>
            <span className="text-3xl">{local.emoji}</span>
            <Badge variant={local.active ? "secondary" : "outline"}>
              {local.active ? "Active" : "Inactive"}
            </Badge>
            <Link to="/admin/rewards">
              <Button variant="outline" className="rounded-2xl font-bold">
                ← Back
              </Button>
            </Link>
          </>
        }
      />
      <RewardEditor
        reward={local}
        onChange={setLocal}
        onSave={handleSave}
        saving={saving}
        readOnly={readOnly}
      />

      {!readOnly && (
        <div className="mt-6">
          <Button
            variant="outline"
            className="rounded-lg border-destructive font-bold text-destructive hover:bg-destructive/5"
            onClick={() => setDeleteOpen(true)}
          >
            Delete reward
          </Button>
        </div>
      )}

      <ConfirmActionDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete reward"
        description={`Permanently delete "${local.name}" from the catalogue? This cannot be undone.`}
        confirmLabel="Delete reward"
        onConfirm={handleDelete}
        loading={deleting}
        variant="destructive"
      />
    </div>
  );
}
