import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AdminDataTable } from "@/components/admin/admin-data-table";
import { AdminPageHeader, AdminPrimaryButton } from "@/components/admin/admin-page-header";
import { AdminPermissionGate } from "@/components/admin/admin-permission-gate";
import { AdminSection } from "@/components/admin/admin-section";
import { ConfirmActionDialog } from "@/components/shared/dialogs";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAsyncData } from "@/hooks/use-async-data";
import {
  deleteSqftRate,
  listSqftRates,
  recalculateCatalogPrices,
  saveSqftRate,
  type SqftRate,
} from "@/services/admin/sqft-rates";

export const Route = createFileRoute("/admin/pricing/sqft-rates")({
  component: SqftRatesPage,
});

function emptyRate(): SqftRate {
  return {
    guarantee: "",
    thickness: "",
    mrpPerSqft: 0,
    dealerPerSqft: 0,
    rewardPercent: 0,
    effectiveFrom: new Date().toISOString().slice(0, 10),
  };
}

function SqftRatesPage() {
  const [draft, setDraft] = useState<SqftRate>(emptyRate());
  const [saving, setSaving] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SqftRate | null>(null);
  const [recalcOpen, setRecalcOpen] = useState(false);

  const { data, loading, error, retry } = useAsyncData(() => listSqftRates(), []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSqftRate(draft);
      toast.success("Rate saved");
      setDraft(emptyRate());
      retry();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleRecalculate = async () => {
    setRecalculating(true);
    try {
      const result = await recalculateCatalogPrices();
      toast.success(`Updated ${result.updated} product price(s) from ${result.rateCount} rate row(s)`);
      setRecalcOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Recalculate failed");
    } finally {
      setRecalculating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await deleteSqftRate(deleteTarget.guarantee, deleteTarget.thickness);
      toast.success("Rate deleted");
      setDeleteTarget(null);
      retry();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) return <PageSkeleton rows={4} />;
  if (error && !data) return <ErrorState message={error} onRetry={retry} />;

  return (
    <AdminPermissionGate permission="catalog:read">
      <AdminPageHeader
        title="Sq ft pricing rates"
        description="Catalog base prices (72″ × 36″) are derived from guarantee + thickness rates."
        actions={
          <Link to="/admin/products">
            <Button variant="outline" className="rounded-lg font-bold">← Products</Button>
          </Link>
        }
      />

      <AdminSection title="Rates grid" className="mb-6">
        <AdminDataTable
          data={data ?? []}
          keyFn={(r) => `${r.guarantee}-${r.thickness}`}
          emptyTitle="No sq ft rates yet"
          columns={[
            { key: "guarantee", header: "Guarantee", cell: (r) => r.guarantee },
            { key: "thickness", header: "Thickness", cell: (r) => r.thickness },
            { key: "mrp", header: "MRP / sqft", cell: (r) => r.mrpPerSqft.toLocaleString("en-IN") },
            { key: "dealer", header: "Dealer / sqft", cell: (r) => r.dealerPerSqft.toLocaleString("en-IN") },
            { key: "reward", header: "Reward %", cell: (r) => `${r.rewardPercent}%` },
            {
              key: "actions",
              header: "",
              cell: (r) => (
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" className="rounded-lg" onClick={() => setDraft(r)}>
                    Edit
                  </Button>
                  <AdminPermissionGate permission="catalog:write">
                    <Button
                      size="sm"
                      variant="destructive"
                      className="rounded-lg"
                      onClick={() => setDeleteTarget(r)}
                    >
                      Delete
                    </Button>
                  </AdminPermissionGate>
                </div>
              ),
            },
          ]}
        />
      </AdminSection>

      <AdminPermissionGate permission="catalog:write">
        <AdminSection title="Add or update rate">
          <div className="grid max-w-lg gap-3">
            <div>
              <Label>Guarantee</Label>
              <Input
                className="mt-1 rounded-2xl"
                value={draft.guarantee}
                onChange={(e) => setDraft({ ...draft, guarantee: e.target.value })}
              />
            </div>
            <div>
              <Label>Thickness</Label>
              <Input
                className="mt-1 rounded-2xl"
                value={draft.thickness}
                onChange={(e) => setDraft({ ...draft, thickness: e.target.value })}
                placeholder="e.g. 6&quot;"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>MRP per sq ft</Label>
                <Input
                  type="number"
                  className="mt-1 rounded-2xl"
                  value={draft.mrpPerSqft || ""}
                  onChange={(e) => setDraft({ ...draft, mrpPerSqft: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Dealer per sq ft</Label>
                <Input
                  type="number"
                  className="mt-1 rounded-2xl"
                  value={draft.dealerPerSqft || ""}
                  onChange={(e) => setDraft({ ...draft, dealerPerSqft: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Reward %</Label>
                <Input
                  type="number"
                  className="mt-1 rounded-2xl"
                  value={draft.rewardPercent || ""}
                  onChange={(e) => setDraft({ ...draft, rewardPercent: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Effective from</Label>
                <Input
                  type="date"
                  className="mt-1 rounded-2xl"
                  value={draft.effectiveFrom}
                  onChange={(e) => setDraft({ ...draft, effectiveFrom: e.target.value })}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <AdminPrimaryButton onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save rate"}
              </AdminPrimaryButton>
              <Button variant="outline" className="rounded-2xl font-bold" onClick={() => setRecalcOpen(true)}>
                Recalculate all prices
              </Button>
            </div>
          </div>
        </AdminSection>
      </AdminPermissionGate>

      <ConfirmActionDialog
        open={recalcOpen}
        onOpenChange={setRecalcOpen}
        title="Recalculate catalog prices?"
        description="This updates product_prices for all products matching each guarantee + thickness rate."
        confirmLabel="Recalculate"
        onConfirm={handleRecalculate}
        loading={recalculating}
      />

      <ConfirmActionDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete rate?"
        description={`Remove ${deleteTarget?.guarantee} / ${deleteTarget?.thickness}?`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        loading={saving}
      />
    </AdminPermissionGate>
  );
}
