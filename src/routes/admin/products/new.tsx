import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { AdminPageHeader, AdminPrimaryButton } from "@/components/admin/admin-page-header";
import { AdminPermissionGate } from "@/components/admin/admin-permission-gate";
import { AdminSection } from "@/components/admin/admin-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AdminProduct } from "@/lib/mock/admin/types";
import { PRODUCT_CATALOGUE_LAYERS, PRODUCT_CATEGORIES, PRODUCT_GUARANTEES } from "@/lib/demo-data";
import { saveProduct } from "@/services/admin/products";
import { listPricingTiers } from "@/services/admin/pricing-tiers";
import { calculateDealerPrice, calculateDistributorPrice } from "@/lib/distributor-price";
import { formatFreeItemsDisplay } from "@/lib/free-items";
import { calculateRewardPoints } from "../../../../shared/reward-points";

export const Route = createFileRoute("/admin/products/new")({
  component: NewProductPage,
});

const emptyProduct = (): AdminProduct => ({
  id: `prod-${Date.now()}`,
  name: "",
  category: "Mattresses",
  guarantee: "5 Years",
  thicknesses: ['6"'],
  mrp: 0,
  dealerPrice: 0,
  points: 0,
  rewardPercent: 0,
  rewardEligibility: "dealer",
  rewardRuleActive: true,
  blurb: "",
  image: "",
  status: "active",
});

function NewProductPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [product, setProduct] = useState(emptyProduct);
  const [saving, setSaving] = useState(false);

  const update = (patch: Partial<AdminProduct>) => setProduct((p) => ({ ...p, ...patch }));

  const handleSave = async () => {
    if (!product.name.trim()) {
      toast.error("Product name is required");
      return;
    }
    setSaving(true);
    try {
      await saveProduct(product);
      toast.success("Product saved");
      await navigate({ to: "/admin/products/$productId", params: { productId: product.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("errors.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminPermissionGate permission="catalog:write">
      <AdminPageHeader
        title="Add product"
        actions={
          <Link to="/admin/products">
            <Button variant="outline" className="rounded-2xl font-bold">Cancel</Button>
          </Link>
        }
      />
      <ProductEditor product={product} onChange={update} onSave={handleSave} saving={saving} />
    </AdminPermissionGate>
  );
}

type TierMargin = NonNullable<AdminProduct["tierMargins"]>[number];

/**
 * Responsive per-price-list margin editor. One data source, three layouts:
 *  - Desktop (lg+): a full-width table that fits without horizontal scroll.
 *  - Tablet (md–lg): a 2-column grid of compact per-tier cards (not a shrunk desktop table).
 *  - Mobile (<md): stacked single-column cards.
 * Dealer/Distributor prices recalc live as margins change (same formulas as before).
 */
function PriceListEditor({
  tiers,
  mrp,
  readOnly,
  showMargin,
  onChangeTiers,
}: {
  tiers: TierMargin[];
  mrp: number;
  readOnly?: boolean;
  showMargin: (value: number) => string;
  onChangeTiers: (next: TierMargin[]) => void;
}) {
  const compute = (tier: TierMargin) => {
    const dealerPrice = calculateDealerPrice(mrp || 0, tier.dealerMarginPercent);
    const distPrice = calculateDistributorPrice(dealerPrice, tier.distributorMarginPercent);
    return { dealerPrice, distPrice };
  };
  const patchTier = (index: number, patch: Partial<TierMargin>) => {
    const next = [...tiers];
    next[index] = { ...tiers[index]!, ...patch };
    onChangeTiers(next);
  };

  if (tiers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No price lists yet. Create one under Pricing → Price lists.
      </p>
    );
  }

  return (
    <>
      {/* Desktop (lg+): full-width table, no forced horizontal scroll. */}
      <div className="hidden overflow-hidden rounded-xl border border-border lg:block">
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="w-[22%] px-3 py-2.5">Price list</th>
              <th className="w-[14%] px-3 py-2.5 text-right">MRP</th>
              <th className="w-[16%] px-3 py-2.5">Dealer margin %</th>
              <th className="w-[16%] px-3 py-2.5 text-right">Dealer price</th>
              <th className="w-[16%] px-3 py-2.5">Dist. margin %</th>
              <th className="w-[16%] px-3 py-2.5 text-right">Distributor price</th>
            </tr>
          </thead>
          <tbody>
            {tiers.map((tier, index) => {
              const { dealerPrice, distPrice } = compute(tier);
              return (
                <tr key={tier.tierId} className="border-t border-border/70 align-middle">
                  <td className="px-3 py-2.5">
                    <span className="font-semibold">{tier.code}</span>
                    {tier.name ? (
                      <span className="block text-xs font-normal text-muted-foreground">{tier.name}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{mrp ? `₹${mrp}` : "—"}</td>
                  <td className="px-3 py-2.5">
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={100}
                      step="0.1"
                      disabled={readOnly}
                      value={showMargin(tier.dealerMarginPercent)}
                      className="h-10 w-full rounded-xl text-right"
                      onChange={(e) => patchTier(index, { dealerMarginPercent: Number(e.target.value) })}
                    />
                  </td>
                  <td className="px-3 py-2.5 text-right font-bold tabular-nums">₹{dealerPrice}</td>
                  <td className="px-3 py-2.5">
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.1"
                      disabled={readOnly}
                      value={showMargin(tier.distributorMarginPercent)}
                      className="h-10 w-full rounded-xl text-right"
                      onChange={(e) => patchTier(index, { distributorMarginPercent: Number(e.target.value) })}
                    />
                  </td>
                  <td className="px-3 py-2.5 text-right font-bold tabular-nums">
                    {Number.isFinite(distPrice) ? `₹${distPrice}` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Tablet (md–lg) + Mobile (<md): cards. 2 columns on tablet, 1 on mobile. */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:hidden">
        {tiers.map((tier, index) => {
          const { dealerPrice, distPrice } = compute(tier);
          return (
            <div key={tier.tierId} className="rounded-xl border border-border p-3 shadow-soft">
              <div className="flex items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{tier.code}</p>
                  {tier.name ? (
                    <p className="truncate text-xs text-muted-foreground">{tier.name}</p>
                  ) : null}
                </div>
                <span className="shrink-0 text-xs font-medium text-muted-foreground">
                  MRP ₹{mrp || 0}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Dealer margin %</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={100}
                    step="0.1"
                    disabled={readOnly}
                    value={showMargin(tier.dealerMarginPercent)}
                    className="mt-1 h-11 rounded-xl text-right"
                    onChange={(e) => patchTier(index, { dealerMarginPercent: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Dist. margin %</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.1"
                    disabled={readOnly}
                    value={showMargin(tier.distributorMarginPercent)}
                    className="mt-1 h-11 rounded-xl text-right"
                    onChange={(e) => patchTier(index, { distributorMarginPercent: Number(e.target.value) })}
                  />
                </div>
                <div className="rounded-lg bg-muted/40 px-2.5 py-2">
                  <p className="text-xs text-muted-foreground">Dealer price</p>
                  <p className="font-bold tabular-nums">₹{dealerPrice}</p>
                </div>
                <div className="rounded-lg bg-muted/40 px-2.5 py-2">
                  <p className="text-xs text-muted-foreground">Distributor price</p>
                  <p className="font-bold tabular-nums">
                    {Number.isFinite(distPrice) ? `₹${distPrice}` : "—"}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

export function ProductEditor({
  product,
  onChange,
  onSave,
  onArchive,
  saving,
  readOnly,
}: {
  product: AdminProduct;
  onChange: (patch: Partial<AdminProduct>) => void;
  onSave: () => void;
  onArchive?: () => void;
  saving?: boolean;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const freeItemsList = product.freeItemsList ?? [];

  // Margins backfilled from legacy absolute prices can be long repeating decimals
  // (e.g. 34.61538…). Show at most 2 decimals so the fields stay clean.
  const showMargin = (value: number) => {
    if (!value) return "";
    return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
  };

  // Seed the per-price-list margin rows from the configured price lists once, when the
  // editor opens without them (new product, or an existing product that predates margins).
  useEffect(() => {
    if (readOnly || (product.tierMargins && product.tierMargins.length > 0)) return;
    let cancelled = false;
    listPricingTiers()
      .then((res) => {
        if (cancelled || !res.items.length) return;
        onChange({
          tierMargins: res.items.map((tier) => ({
            tierId: tier.id,
            code: tier.code,
            name: tier.name,
            dealerMarginPercent: 0,
            distributorMarginPercent: tier.distributorMarginPercent,
          })),
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id, readOnly]);

  // Keep the legacy freeItems string in sync with the structured list, so existing
  // consumers (catalog/order display) keep working.
  const syncFreeItems = (list: Array<{ label: string; quantity: number }>) => {
    const cleaned = list
      .map((row) => ({ label: row.label, quantity: Math.max(1, row.quantity || 1) }))
      .filter((row) => row.label.trim() || row.quantity);
    onChange({
      freeItemsList: list,
      freeItems: cleaned.length ? JSON.stringify(cleaned) : undefined,
    });
  };

  return (
    <Tabs defaultValue="basics" className="space-y-4 pb-4">
      <div className="-mx-1 overflow-x-auto px-1 scrollbar-none">
        <TabsList className="inline-flex w-max min-w-full rounded-2xl">
          <TabsTrigger value="basics">Basics</TabsTrigger>
          <TabsTrigger value="sizes">Sizes & thickness</TabsTrigger>
          <TabsTrigger value="pricing">Pricing</TabsTrigger>
          <TabsTrigger value="catalogue">Catalogue layer</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="basics">
        <AdminSection title="Basics">
          <div className="grid max-w-lg gap-4">
            <div>
              <Label>Name</Label>
              <Input
                value={product.name}
                disabled={readOnly}
                onChange={(e) => onChange({ name: e.target.value })}
                className="mt-1 rounded-2xl"
              />
            </div>
            <div>
              <Label>Category</Label>
              <Select
                value={product.category}
                disabled={readOnly}
                onValueChange={(v) => onChange({ category: v })}
              >
                <SelectTrigger className="mt-1 rounded-2xl">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {PRODUCT_CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={product.blurb}
                disabled={readOnly}
                onChange={(e) => onChange({ blurb: e.target.value })}
                className="mt-1 rounded-2xl"
              />
            </div>
            <div>
              <Label>Guarantee</Label>
              <Select
                value={product.guarantee}
                disabled={readOnly}
                onValueChange={(v) =>
                  onChange({
                    guarantee: v,
                    layerGroup:
                      !product.layerGroup || product.layerGroup === product.guarantee ? v : product.layerGroup,
                  })
                }
              >
                <SelectTrigger className="mt-1 rounded-2xl">
                  <SelectValue placeholder="Select guarantee" />
                </SelectTrigger>
                <SelectContent>
                  {PRODUCT_GUARANTEES.map((guarantee) => (
                    <SelectItem key={guarantee} value={guarantee}>
                      {guarantee}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </AdminSection>
      </TabsContent>

      <TabsContent value="sizes">
        <AdminSection title="Sizes & thickness">
          <div className="grid max-w-lg gap-4">
            <div>
              <Label>Fixed size (optional)</Label>
              <Input
                value={product.fixedSize ?? ""}
                disabled={readOnly}
                onChange={(e) => onChange({ fixedSize: e.target.value || undefined })}
                placeholder='e.g. 72" × 60"'
                className="mt-1 rounded-2xl"
              />
            </div>
            <div>
              <Label>Thickness options (comma-separated)</Label>
              <Input
                value={product.thicknesses.join(", ")}
                disabled={readOnly}
                onChange={(e) =>
                  onChange({
                    thicknesses: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                  })
                }
                className="mt-1 rounded-2xl"
              />
            </div>
          </div>
        </AdminSection>
      </TabsContent>

      <TabsContent value="pricing">
        <AdminSection title="Pricing & rewards">
          {/* Price lists span the full available width (desktop table / tablet + mobile cards). */}
          <div className="space-y-6">
            <div className="max-w-xs">
              <Label>MRP (₹)</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={product.mrp || ""}
                disabled={readOnly}
                onChange={(e) => onChange({ mrp: Number(e.target.value) })}
                className="mt-1 rounded-2xl"
              />
            </div>

            <div className="space-y-2">
              <Label>Price lists (margins per product)</Label>
              <p className="text-xs text-muted-foreground">
                Dealer Price = MRP × (1 − Dealer Margin%). Distributor Price = Dealer Price ÷ (1 +
                Distributor Margin%), rounded to the nearest rupee. MRP is fixed for all lists.
              </p>
              <PriceListEditor
                tiers={product.tierMargins ?? []}
                mrp={product.mrp}
                readOnly={readOnly}
                showMargin={showMargin}
                onChangeTiers={(next) => onChange({ tierMargins: next })}
              />
            </div>

            <div className="grid max-w-lg gap-4 sm:grid-cols-2">
            <div>
              <Label>Reward % of Dealer Price</Label>
              <Input
                type="number"
                step="0.1"
                value={product.rewardPercent || ""}
                disabled={readOnly}
                onChange={(e) => {
                  const percent = Math.max(0, Number(e.target.value) || 0);
                  onChange({
                    rewardPercent: percent,
                    points: calculateRewardPoints(product.dealerPrice, percent),
                  });
                }}
                className="mt-1 rounded-2xl"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Points = {calculateRewardPoints(product.dealerPrice, product.rewardPercent)} per unit at current dealer price
              </p>
            </div>
            <div>
              <Label>Reward eligibility</Label>
              <Select
                value={product.rewardEligibility}
                disabled={readOnly}
                onValueChange={(v) =>
                  onChange({ rewardEligibility: v as AdminProduct["rewardEligibility"] })
                }
              >
                <SelectTrigger className="mt-1 rounded-2xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dealer">Dealer only</SelectItem>
                  <SelectItem value="distributor">Distributor only</SelectItem>
                  <SelectItem value="both">Both dealer & distributor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <Checkbox
                checked={product.rewardRuleActive}
                disabled={readOnly}
                onCheckedChange={(v) => onChange({ rewardRuleActive: Boolean(v) })}
              />
              <Label>Reward rule active</Label>
            </div>
            <div className="sm:col-span-2 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Free items</Label>
                {!readOnly ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-xl"
                    onClick={() => syncFreeItems([...freeItemsList, { label: "", quantity: 1 }])}
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Add item
                  </Button>
                ) : null}
              </div>
              {freeItemsList.length === 0 ? (
                <p className="text-sm text-muted-foreground">No free items added yet.</p>
              ) : (
                <div className="space-y-2">
                  {freeItemsList.map((item, index) => (
                    <div key={`free-item-${index}`} className="flex items-center gap-2">
                      <div className="w-20 shrink-0">
                        <Input
                          type="text"
                          inputMode="numeric"
                          disabled={readOnly}
                          value={item.quantity > 0 ? String(item.quantity) : ""}
                          placeholder="Qty"
                          aria-label="Quantity"
                          className="rounded-xl"
                          onChange={(e) => {
                            const digits = e.target.value.replace(/\D/g, "");
                            const next = [...freeItemsList];
                            next[index] = {
                              ...item,
                              quantity: digits === "" ? 0 : Math.max(1, Number(digits)),
                            };
                            syncFreeItems(next);
                          }}
                        />
                      </div>
                      <Input
                        disabled={readOnly}
                        value={item.label}
                        placeholder="e.g. Fiber Pillows"
                        className="flex-1 rounded-xl"
                        onChange={(e) => {
                          const next = [...freeItemsList];
                          next[index] = { ...item, label: e.target.value };
                          syncFreeItems(next);
                        }}
                      />
                      {!readOnly ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="rounded-xl"
                          aria-label="Remove"
                          onClick={() =>
                            syncFreeItems(freeItemsList.filter((_, rowIndex) => rowIndex !== index))
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
            </div>
          </div>
        </AdminSection>
      </TabsContent>

      <TabsContent value="catalogue">
        <AdminSection title="Catalogue layer">
          <div className="max-w-lg">
            <Label>Catalogue layer (warranty group)</Label>
            <Select
              value={product.layerGroup ?? product.guarantee}
              disabled={readOnly}
              onValueChange={(v) => onChange({ layerGroup: v })}
            >
              <SelectTrigger className="mt-1 rounded-2xl">
                <SelectValue placeholder="Select catalogue layer" />
              </SelectTrigger>
              <SelectContent>
                {PRODUCT_CATALOGUE_LAYERS.map((layer) => (
                  <SelectItem key={layer} value={layer}>
                    {layer}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </AdminSection>
      </TabsContent>

      {!readOnly && (
        <div className="flex gap-2">
          <AdminPrimaryButton onClick={onSave} disabled={saving}>
            {saving ? t("common.saving") : "Save product"}
          </AdminPrimaryButton>
          {onArchive && (
            <Button variant="outline" className="rounded-2xl font-bold" onClick={onArchive}>
              Archive
            </Button>
          )}
        </div>
      )}
    </Tabs>
  );
}
