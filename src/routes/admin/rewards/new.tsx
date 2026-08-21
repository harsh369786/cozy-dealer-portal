import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AdminPageHeader, AdminPrimaryButton } from "@/components/admin/admin-page-header";
import { AdminPermissionGate } from "@/components/admin/admin-permission-gate";
import { AdminSection } from "@/components/admin/admin-section";
import { RewardImageUpload } from "@/components/admin/reward-image-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { AdminRewardCatalogItem } from "@/lib/mock/admin/types";
import { saveRewardItem } from "@/services/admin/rewards";

export const Route = createFileRoute("/admin/rewards/new")({
  component: NewRewardPage,
});

function emptyReward(): AdminRewardCatalogItem {
  return {
    id: `rw-${Date.now()}`,
    emoji: "🎁",
    name: "",
    pointsRequired: 1000,
    active: true,
  };
}

export function RewardEditor({
  reward,
  onChange,
  onSave,
  saving,
  readOnly,
}: {
  reward: AdminRewardCatalogItem;
  onChange: (r: AdminRewardCatalogItem) => void;
  onSave: () => void;
  saving?: boolean;
  readOnly?: boolean;
}) {
  const patch = (p: Partial<AdminRewardCatalogItem>) => onChange({ ...reward, ...p });

  return (
    <AdminSection title="Reward details">
      <div className="grid max-w-lg gap-4">
        <div>
          <Label>Emoji</Label>
          <Input
            value={reward.emoji}
            disabled={readOnly}
            onChange={(e) => patch({ emoji: e.target.value })}
            className="mt-1 rounded-2xl"
            placeholder="🎁"
          />
        </div>
        <div>
          <Label>Name</Label>
          <Input
            value={reward.name}
            disabled={readOnly}
            onChange={(e) => patch({ name: e.target.value })}
            className="mt-1 rounded-2xl"
            placeholder="Bluetooth Speaker"
          />
        </div>
        <RewardImageUpload
          imageUrl={reward.imageUrl}
          disabled={readOnly}
          onChange={(next) => patch(next)}
        />
        <div>
          <Label>Points required</Label>
          <Input
            type="number"
            min={1}
            value={reward.pointsRequired}
            disabled={readOnly}
            onChange={(e) => patch({ pointsRequired: Number(e.target.value) || 0 })}
            className="mt-1 rounded-2xl"
          />
        </div>
        <div className="flex items-center justify-between rounded-2xl border border-border bg-secondary/30 px-4 py-3">
          <div>
            <p className="text-sm font-bold">Active in catalogue</p>
            <p className="text-xs text-muted-foreground">Dealers can redeem when active</p>
          </div>
          <Switch
            checked={reward.active}
            disabled={readOnly}
            onCheckedChange={(v) => patch({ active: v })}
          />
        </div>
        {!readOnly && (
          <AdminPrimaryButton onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : "Save reward"}
          </AdminPrimaryButton>
        )}
      </div>
    </AdminSection>
  );
}

function NewRewardPage() {
  const navigate = useNavigate();
  const [reward, setReward] = useState(emptyReward);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!reward.name.trim()) {
      toast.error("Reward name is required");
      return;
    }
    if (reward.pointsRequired < 1) {
      toast.error("Points must be at least 1");
      return;
    }
    setSaving(true);
    try {
      await saveRewardItem(reward);
      toast.success("Reward created");
      await navigate({ to: "/admin/rewards/$rewardId", params: { rewardId: reward.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminPermissionGate permission="catalog:write">
      <AdminPageHeader
        title="Add reward"
        description="Add a new item to the dealer rewards catalogue."
        actions={
          <Link to="/admin/rewards">
            <Button variant="outline" className="rounded-2xl font-bold">
              Cancel
            </Button>
          </Link>
        }
      />
      <RewardEditor reward={reward} onChange={setReward} onSave={handleSave} saving={saving} />
    </AdminPermissionGate>
  );
}
