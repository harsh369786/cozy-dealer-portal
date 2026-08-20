import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { useAsyncData } from "@/hooks/use-async-data";
import { useAdminPermissions } from "@/hooks/use-admin-permissions";
import { getRewardItem, saveRewardItem } from "@/services/admin/rewards";
import { RewardEditor } from "./new";

export const Route = createFileRoute("/admin/rewards/$rewardId")({
  component: EditRewardPage,
});

function EditRewardPage() {
  const { rewardId } = Route.useParams();
  const { can } = useAdminPermissions();
  const [local, setLocal] = useState<Awaited<ReturnType<typeof getRewardItem>>>(null);
  const [saving, setSaving] = useState(false);

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
    </div>
  );
}
