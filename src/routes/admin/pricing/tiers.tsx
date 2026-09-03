import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AdminPageHeader, AdminPrimaryButton } from "@/components/admin/admin-page-header";
import { AdminPermissionGate } from "@/components/admin/admin-permission-gate";
import { AdminSection } from "@/components/admin/admin-section";
import { ConfirmActionDialog } from "@/components/shared/dialogs";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAsyncData } from "@/hooks/use-async-data";
import { useAdminPermissions } from "@/hooks/use-admin-permissions";
import {
  createPricingTier,
  deletePricingTier,
  listPricingTiers,
  updatePricingTier,
  type PricingTier,
} from "@/services/admin/pricing-tiers";

export const Route = createFileRoute("/admin/pricing/tiers")({
  component: PricingTiersPage,
});

function PricingTiersPage() {
  return (
    <AdminPermissionGate permission="catalog:read">
      <TiersContent />
    </AdminPermissionGate>
  );
}

function TiersContent() {
  const { can } = useAdminPermissions();
  const writable = can("catalog:write");
  const { data, loading, error, retry } = useAsyncData(() => listPricingTiers(), []);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [margin, setMargin] = useState("20");
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleCreate = async () => {
    setSaving(true);
    try {
      await createPricingTier({
        code,
        name: name || code,
        distributorMarginPercent: Number(margin),
      });
      toast.success("Price list created. Set dealer & distributor margins per product in the product editor.");
      setCode("");
      setName("");
      setMargin("20");
      retry();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create tier");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (tier: PricingTier, nextMargin: number, nextName: string) => {
    setSaving(true);
    try {
      await updatePricingTier(tier.id, {
        code: tier.code,
        name: nextName,
        distributorMarginPercent: nextMargin,
      });
      toast.success(`${tier.code} updated.`);
      retry();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save tier");
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) return <PageSkeleton rows={4} />;
  if (error && !data) return <ErrorState message={error} onRetry={retry} />;

  const items = data?.items ?? [];

  return (
    <div>
      <AdminPageHeader
        title="Price lists (T1, T2, T3…)"
        description="Create price lists and assign them to dealers. Dealer & distributor margins are set per product in the product editor. The distributor margin % here is only the default used for products that have no per-product value yet."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/admin/pricing/sqft-rates">
              <Button variant="outline" className="rounded-lg font-bold">
                Sq ft rates
              </Button>
            </Link>
            <Link to="/admin/products">
              <Button variant="outline" className="rounded-lg font-bold">
                Products
              </Button>
            </Link>
          </div>
        }
      />

      <AdminSection title="Tiers">
        <div className="space-y-4">
          {items.map((tier) => (
            <TierRow key={tier.id} tier={tier} writable={writable} saving={saving} onSave={handleSave} onDelete={setDeleteId} />
          ))}
        </div>
      </AdminSection>

      {writable && (
        <AdminSection title="Add tier" className="mt-4">
          <div className="grid max-w-xl gap-3 sm:grid-cols-3">
            <div>
              <Label>Code</Label>
              <Input className="mt-1 rounded-xl" placeholder="T2" value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            <div>
              <Label>Name</Label>
              <Input className="mt-1 rounded-xl" placeholder="Tier 2" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label>Default distributor margin %</Label>
              <Input className="mt-1 rounded-xl" type="number" value={margin} onChange={(e) => setMargin(e.target.value)} />
            </div>
          </div>
          <AdminPrimaryButton disabled={saving || !code.trim()} onClick={() => void handleCreate()}>
            Add price list
          </AdminPrimaryButton>
        </AdminSection>
      )}

      <ConfirmActionDialog
        open={Boolean(deleteId)}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Delete pricing tier?"
        description="Users on this tier will be moved to T1."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={async () => {
          if (!deleteId) return;
          try {
            await deletePricingTier(deleteId);
            toast.success("Tier deleted");
            setDeleteId(null);
            retry();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Delete failed");
          }
        }}
      />
    </div>
  );
}

function TierRow({
  tier,
  writable,
  saving,
  onSave,
  onDelete,
}: {
  tier: PricingTier;
  writable: boolean;
  saving: boolean;
  onSave: (tier: PricingTier, margin: number, name: string) => Promise<void>;
  onDelete: (id: string) => void;
}) {
  const [margin, setMargin] = useState(String(tier.distributorMarginPercent));
  const [name, setName] = useState(tier.name);
  return (
    <div className="rounded-xl border border-border p-4">
      <p className="font-display text-lg font-bold">{tier.code}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Name</Label>
          <Input className="mt-1 rounded-xl" value={name} disabled={!writable} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label>Default distributor margin %</Label>
          <Input
            className="mt-1 rounded-xl"
            type="number"
            value={margin}
            disabled={!writable}
            onChange={(e) => setMargin(e.target.value)}
          />
        </div>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Default only. Per-product margins set in the product editor take precedence. Example: dealer ₹120 at{" "}
        {margin || 0}% → distributor ₹{Math.round(120 / (1 + Number(margin || 0) / 100)) || 0}
      </p>
      {writable && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            className="rounded-xl font-bold"
            disabled={saving}
            onClick={() => void onSave(tier, Number(margin), name)}
          >
            Save
          </Button>
          {tier.id !== "tier-t1" && (
            <Button variant="outline" className="rounded-xl" onClick={() => onDelete(tier.id)}>
              Delete
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
