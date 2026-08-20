import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AdminPageHeader, AdminPrimaryButton } from "@/components/admin/admin-page-header";
import { AdminPermissionGate } from "@/components/admin/admin-permission-gate";
import { AdminSection } from "@/components/admin/admin-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import type { AdminCampaign, CampaignType } from "@/lib/mock/admin/types";
import { saveCampaign } from "@/services/admin/campaigns";

export const Route = createFileRoute("/admin/campaigns/new")({
  component: NewCampaignPage,
});

function NewCampaignPage() {
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<AdminCampaign>({
    id: `camp-${Date.now()}`,
    type: "price",
    name: "",
    product: "",
    description: "",
    startDate: "",
    endDate: "",
    status: "upcoming",
    active: true,
    whatsappTargetDealers: true,
    whatsappTargetDistributors: false,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!campaign.name.trim()) {
      toast.error("Campaign name is required");
      return;
    }
    setSaving(true);
    try {
      await saveCampaign(campaign);
      toast.success("Campaign created");
      await navigate({ to: "/admin/campaigns/$campaignId", params: { campaignId: campaign.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminPermissionGate permission="campaigns:write">
      <AdminPageHeader
        title="Create campaign"
        actions={
          <Link to="/admin/campaigns">
            <Button variant="outline" className="rounded-2xl font-bold">Cancel</Button>
          </Link>
        }
      />
      <CampaignForm campaign={campaign} onChange={setCampaign} onSave={handleSave} saving={saving} />
    </AdminPermissionGate>
  );
}

export function CampaignForm({
  campaign,
  onChange,
  onSave,
  saving,
  readOnly,
}: {
  campaign: AdminCampaign;
  onChange: (c: AdminCampaign) => void;
  onSave: () => void;
  saving?: boolean;
  readOnly?: boolean;
}) {
  const patch = (p: Partial<AdminCampaign>) => onChange({ ...campaign, ...p });

  return (
    <AdminSection title="Campaign details">
      <div className="grid max-w-lg gap-4">
        <div>
          <Label>Type</Label>
          <Select
            value={campaign.type}
            disabled={readOnly}
            onValueChange={(v) => patch({ type: v as CampaignType })}
          >
            <SelectTrigger className="mt-1 rounded-2xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="price">Price campaign</SelectItem>
              <SelectItem value="sell">Sell volume</SelectItem>
              <SelectItem value="distributor">Distributor broadcast</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Name</Label>
          <Input
            value={campaign.name}
            disabled={readOnly}
            onChange={(e) => patch({ name: e.target.value })}
            className="mt-1 rounded-2xl"
          />
        </div>
        <div>
          <Label>Product</Label>
          <Input
            value={campaign.product}
            disabled={readOnly}
            onChange={(e) => patch({ product: e.target.value })}
            className="mt-1 rounded-2xl"
          />
        </div>
        {campaign.type === "price" && (
          <div>
            <Label>Discount %</Label>
            <Input
              type="number"
              value={campaign.discountPercent ?? ""}
              disabled={readOnly}
              onChange={(e) => patch({ discountPercent: Number(e.target.value) })}
              className="mt-1 rounded-2xl"
            />
          </div>
        )}
        {campaign.type === "sell" && (
          <>
            <div>
              <Label>Goal</Label>
              <Input
                value={campaign.goal ?? ""}
                disabled={readOnly}
                onChange={(e) => patch({ goal: e.target.value })}
                className="mt-1 rounded-2xl"
              />
            </div>
            <div>
              <Label>Reward</Label>
              <Input
                value={campaign.reward ?? ""}
                disabled={readOnly}
                onChange={(e) => patch({ reward: e.target.value })}
                className="mt-1 rounded-2xl"
              />
            </div>
          </>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Start date</Label>
            <Input
              value={campaign.startDate}
              disabled={readOnly}
              onChange={(e) => patch({ startDate: e.target.value })}
              className="mt-1 rounded-2xl"
            />
          </div>
          <div>
            <Label>End date</Label>
            <Input
              value={campaign.endDate}
              disabled={readOnly}
              onChange={(e) => patch({ endDate: e.target.value })}
              className="mt-1 rounded-2xl"
            />
          </div>
        </div>
        <div>
          <Label>Description / terms</Label>
          <Textarea
            value={campaign.description}
            disabled={readOnly}
            onChange={(e) => patch({ description: e.target.value })}
            className="mt-1 rounded-2xl"
          />
        </div>
        <div className="space-y-3 rounded-2xl border border-border bg-secondary/30 p-4">
          <p className="text-sm font-bold">WhatsApp recipients</p>
          <p className="text-xs text-muted-foreground">
            In-app notifications are sent to all relevant users automatically.
          </p>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <Checkbox
              checked={campaign.whatsappTargetDealers}
              disabled={readOnly}
              onCheckedChange={(v) => patch({ whatsappTargetDealers: Boolean(v) })}
            />
            Dealers
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <Checkbox
              checked={campaign.whatsappTargetDistributors}
              disabled={readOnly}
              onCheckedChange={(v) => patch({ whatsappTargetDistributors: Boolean(v) })}
            />
            Distributors
          </label>
        </div>
        {!readOnly && (
          <AdminPrimaryButton onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : "Save campaign"}
          </AdminPrimaryButton>
        )}
      </div>
    </AdminSection>
  );
}
