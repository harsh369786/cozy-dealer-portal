import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AdminPageHeader, AdminPrimaryButton } from "@/components/admin/admin-page-header";
import { AdminPermissionGate } from "@/components/admin/admin-permission-gate";
import { AdminSection } from "@/components/admin/admin-section";
import { CampaignImageUpload } from "@/components/admin/campaign-image-upload";
import { CampaignProductPicker } from "@/components/admin/campaign-product-picker";
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
import { useAdminPermissions } from "@/hooks/use-admin-permissions";
import type { AdminCampaign } from "@/lib/mock/admin/types";
import type { CampaignStatus } from "@/lib/mock/distributor/types";
import { saveCampaign } from "@/services/admin/campaigns";

export const Route = createFileRoute("/admin/campaigns/new")({
  component: NewCampaignPage,
});

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function NewCampaignPage() {
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<AdminCampaign>({
    id: `camp-${Date.now()}`,
    name: "",
    product: "",
    description: "",
    startDate: todayInputValue(),
    endDate: todayInputValue(),
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
    if (!campaign.startDate || !campaign.endDate) {
      toast.error("Start and end dates are required");
      return;
    }
    if (campaign.endDate < campaign.startDate) {
      toast.error("End date must be on or after start date");
      return;
    }
    setSaving(true);
    try {
      const saved = await saveCampaign(campaign);
      toast.success("Campaign created");
      await navigate({ to: "/admin/campaigns/$campaignId", params: { campaignId: saved.id } });
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
  const { isMasterAdmin } = useAdminPermissions();
  const patch = (p: Partial<AdminCampaign>) => onChange({ ...campaign, ...p });
  const formStatus = campaign.storedStatus ?? campaign.status;

  return (
    <AdminSection title="Campaign details">
      <div className="grid max-w-lg gap-4">
        <div>
          <Label>Name</Label>
          <Input
            value={campaign.name}
            disabled={readOnly}
            onChange={(e) => patch({ name: e.target.value })}
            className="mt-1 rounded-2xl"
          />
        </div>
        <CampaignProductPicker
          productId={campaign.productId}
          productName={campaign.product}
          disabled={readOnly}
          allowAllProducts
          onChange={({ productId, product }) => patch({ productId, product })}
        />
        <div>
          <Label>Discount %</Label>
          <Input
            type="number"
            min={0}
            max={100}
            value={campaign.discountPercent ?? ""}
            disabled={readOnly}
            onChange={(e) => patch({ discountPercent: Number(e.target.value) })}
            className="mt-1 rounded-2xl"
          />
        </div>
        <div>
          <Label>Badge label</Label>
          <Input
            value={campaign.badgeLabel ?? ""}
            disabled={readOnly}
            onChange={(e) => patch({ badgeLabel: e.target.value })}
            placeholder="e.g. 10% OFF"
            className="mt-1 rounded-2xl"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="campaign-start-date">Start date</Label>
            <Input
              id="campaign-start-date"
              type="date"
              value={campaign.startDate}
              disabled={readOnly}
              onChange={(e) => patch({ startDate: e.target.value })}
              className="mt-1 rounded-2xl"
            />
          </div>
          <div>
            <Label htmlFor="campaign-end-date">End date</Label>
            <Input
              id="campaign-end-date"
              type="date"
              value={campaign.endDate}
              disabled={readOnly}
              min={campaign.startDate || undefined}
              onChange={(e) => patch({ endDate: e.target.value })}
              className="mt-1 rounded-2xl"
            />
          </div>
        </div>
        {isMasterAdmin && (
          <div>
            <Label>Status</Label>
            <Select
              value={formStatus}
              disabled={readOnly}
              onValueChange={(v) =>
                patch({ status: v as CampaignStatus, storedStatus: v as CampaignStatus })
              }
            >
              <SelectTrigger className="mt-1 rounded-2xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="upcoming">Upcoming</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              Campaigns past their end date are automatically treated as expired.
            </p>
          </div>
        )}
        <div>
          <Label>Description / terms</Label>
          <Textarea
            value={campaign.description}
            disabled={readOnly}
            onChange={(e) => patch({ description: e.target.value })}
            className="mt-1 rounded-2xl"
          />
        </div>
        <CampaignImageUpload
          imageUrl={campaign.imageUrl}
          disabled={readOnly}
          onChange={(image) => patch(image)}
        />
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
