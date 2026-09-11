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
import { NO_GUARANTEE, PRODUCT_CATALOGUE_LAYERS, PRODUCT_CATEGORIES, PRODUCT_GUARANTEES } from "@/lib/demo-data";
import { saveProduct } from "@/services/admin/products";
import { listPricingTiers } from "@/services/admin/pricing-tiers";
import { calculateDealerPrice, calculateDistributorPrice } from "@/lib/distributor-price";
import { formatFreeItemsDisplay } from "@/lib/free-items";
import { calculateRewardPoints } from "../../../../shared/reward-points";
import {
  DEFAULT_FREE_ITEM_WIDTH_THRESHOLD,
  FREE_ITEM_WIDTH_GREATER_EQUAL,
  FREE_ITEM_WIDTH_LESS_THAN,
} from "../../../../shared/free-item-rules";

// A single editable free-item row in the product editor. `widthCondition` null => always given.
type FreeItemRow = {
  label: string;
  quantity: number;
  widthCondition?: "WIDTH_LESS_THAN" | "WIDTH_GREATER_EQUAL" | null;
  widthThreshold?: number | null;
};

// Radix Select needs a non-empty value; this sentinel represents "no width condition (always)".
const FREE_ITEM_WIDTH_ANY = "ANY";

export const Route = createFileRoute("/admin/products/new")({
  component: NewProductPage,
});

// Radix Select can't use an empty-string item value, so this sentinel represents "no catalogue
// warranty layer" and is mapped to undefined on change / from undefined on display.
const NO_LAYER_VALUE = "__none__";

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
  onDelete,
  saving,
  readOnly,
}: {
  product: AdminProduct;
  onChange: (patch: Partial<AdminProduct>) => void;
  onSave: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
  saving?: boolean;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const freeItemsList = product.freeItemsList ?? [];

  // Mattresses (anything that isn't a Pillow/Foldable) require a per-thickness MRP ₹/sqft rate.
  const isMattress = product.category !== "Pillows" && product.category !== "Foldable";

  // Free-text thickness editor: type a value (e.g. 6") and Add it as a removable chip. Kept as an
  // array on product.thicknesses (the per-sq.ft MRP table below reads the same list).
  const [thicknessInput, setThicknessInput] = useState("");

  const addThickness = () => {
    const value = thicknessInput.trim();
    if (!value) return;
    // Case-insensitive dedupe so the same thickness isn't added twice.
    if (product.thicknesses.some((existing) => existing.toLowerCase() === value.toLowerCase())) {
      setThicknessInput("");
      return;
    }
    onChange({ thicknesses: [...product.thicknesses, value] });
    setThicknessInput("");
  };

  const removeThickness = (value: string) => {
    onChange({
      thicknesses: product.thicknesses.filter((existing) => existing !== value),
      // Drop any per-sq.ft rate tied to a thickness that's being removed.
      sqftRates: (product.sqftRates ?? []).filter((r) => r.thickness !== value),
    });
  };

  const sqftRateFor = (thickness: string) =>
    (product.sqftRates ?? []).find((r) => r.thickness === thickness);

  // Set/clear the MRP ₹/sqft rate for one thickness. 0/blank clears it. Rates for thicknesses no
  // longer on the product are dropped so the table always matches the current thickness list.
  const patchSqftRate = (thickness: string, mrpPerSqft: number) => {
    const next = (product.sqftRates ?? []).filter(
      (r) => r.thickness !== thickness && product.thicknesses.includes(r.thickness),
    );
    if (mrpPerSqft > 0) {
      next.push({ thickness, mrpPerSqft });
    }
    onChange({ sqftRates: next });
  };

  // Base reference size for MRP previews: the standard 72"×36" = 18 sq.ft. MRP a dealer sees for a
  // given size is rate × (length/12) × (width/12); we preview at the base size so admins can sanity
  // -check the rate they enter (matches api/services/mattress-pricing.ts base size).
  const BASE_MRP_LENGTH_IN = 72;
  const BASE_MRP_WIDTH_IN = 36;
  const BASE_AREA_SQFT = (BASE_MRP_LENGTH_IN / 12) * (BASE_MRP_WIDTH_IN / 12); // 18
  const previewMrpForRate = (mrpPerSqft?: number) =>
    mrpPerSqft && mrpPerSqft > 0 ? Math.round(mrpPerSqft * BASE_AREA_SQFT) : 0;

  // For a mattress, MRP is dynamic (rate × size), so the manual MRP field is hidden. The price-list
  // margins still apply; to preview dealer/distributor prices we use the base-size MRP of the
  // cheapest configured thickness rate (the "from" price), falling back to the stored product.mrp.
  const mattressBaseMrp = (() => {
    const rates = (product.sqftRates ?? [])
      .map((r) => previewMrpForRate(r.mrpPerSqft))
      .filter((v) => v > 0);
    if (rates.length) return Math.min(...rates);
    return product.mrp || 0;
  })();
  const priceListMrp = isMattress ? mattressBaseMrp : product.mrp;

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
  const syncFreeItems = (list: FreeItemRow[]) => {
    const cleaned = list
      .map((row) => {
        const condition =
          row.widthCondition === FREE_ITEM_WIDTH_LESS_THAN ||
          row.widthCondition === FREE_ITEM_WIDTH_GREATER_EQUAL
            ? row.widthCondition
            : null;
        return {
          label: row.label.trim(),
          quantity: Math.max(1, row.quantity || 1),
          // Only persist width fields when a condition is actually set, so "always" rows stay
          // identical to the legacy {label, quantity} shape (backward compatible).
          ...(condition
            ? {
                widthCondition: condition,
                widthThreshold: Math.max(
                  1,
                  Number(row.widthThreshold) || DEFAULT_FREE_ITEM_WIDTH_THRESHOLD,
                ),
              }
            : {}),
        };
      })
      .filter((row) => row.label);
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
                    // Keep the catalogue warranty-layer in sync with the guarantee while the admin
                    // hasn't overridden it. "No guarantee" has no warranty layer, so clear it.
                    layerGroup:
                      v === NO_GUARANTEE
                        ? undefined
                        : !product.layerGroup || product.layerGroup === product.guarantee
                          ? v
                          : product.layerGroup,
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
              <Label>{isMattress ? "Thickness options" : "Fixed thickness"}</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                {isMattress
                  ? 'Add each thickness a customer can order (e.g. 6"). Type a value and press Add or Enter. Set a ₹/sq.ft rate for every thickness under the Pricing tab.'
                  : 'Set the fixed thickness for this product (e.g. 4"). It is saved as a product attribute and shown in product/order details — the dealer does not select it while ordering. Pillows can leave this empty.'}
              </p>
              {product.thicknesses.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {product.thicknesses.map((thickness) => (
                    <span
                      key={`thk-${thickness}`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/60 px-3 py-1 text-sm font-medium"
                    >
                      {thickness}
                      {!readOnly && (
                        <button
                          type="button"
                          aria-label={`Remove ${thickness}`}
                          onClick={() => removeThickness(thickness)}
                          className="grid h-4 w-4 place-items-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}
              {!readOnly && (
                <div className="mt-2 flex max-w-sm gap-2">
                  <Input
                    value={thicknessInput}
                    onChange={(e) => setThicknessInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addThickness();
                      }
                    }}
                    placeholder='e.g. 6"'
                    className="rounded-2xl"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addThickness}
                    disabled={!thicknessInput.trim()}
                    className="shrink-0 rounded-2xl"
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Add
                  </Button>
                </div>
              )}
              {product.thicknesses.length === 0 && (
                <p className="mt-2 text-xs text-muted-foreground">No thickness options added yet.</p>
              )}
            </div>
          </div>
        </AdminSection>
      </TabsContent>

      <TabsContent value="pricing">
        <AdminSection title="Pricing & rewards">
          {/* Price lists span the full available width (desktop table / tablet + mobile cards). */}
          <div className="space-y-6">
            {isMattress ? (
              // Mattress MRP is not entered manually — it is computed at order time from the
              // per-thickness ₹/sq.ft rate and the chosen (snapped) size. Set the rates in the
              // "Per-sq.ft MRP (mattress)" section below.
              <div className="max-w-xl rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
                MRP for mattresses is calculated automatically from the per-thickness ₹/sq.ft rate ×
                the ordered size — there is no manual MRP. Set the rates in the “Per-sq.ft MRP
                (mattress)” section below. The price-list margins below preview against the base
                72&quot;×36&quot; size.
              </div>
            ) : (
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
            )}

            <div className="space-y-2">
              <Label>Price lists (margins per product)</Label>
              <p className="text-xs text-muted-foreground">
                Dealer Price = MRP × (1 − Dealer Margin%). Distributor Price = Dealer Price ÷ (1 +
                Distributor Margin%), rounded to the nearest rupee.
                {isMattress
                  ? " MRP shown here is the base 72\"×36\" preview; the real MRP scales with the ordered size."
                  : " MRP is fixed for all lists."}
              </p>
              <PriceListEditor
                tiers={product.tierMargins ?? []}
                mrp={priceListMrp}
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
                <Label>Free items with this product</Label>
                {!readOnly ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-xl"
                    onClick={() =>
                      syncFreeItems([
                        ...freeItemsList,
                        { label: "", quantity: 1, widthCondition: null },
                      ])
                    }
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Add free item
                  </Button>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                Free items can apply always, or only for a width range. Width uses the ordered
                mattress width (breadth); length is ignored. “Less than” means width &lt; threshold;
                “Greater or equal” means width ≥ threshold (so exactly the threshold falls here).
              </p>
              {freeItemsList.length === 0 ? (
                <p className="text-sm text-muted-foreground">No free items added yet.</p>
              ) : (
                <div className="space-y-3">
                  {freeItemsList.map((item, index) => {
                    const condition =
                      item.widthCondition === FREE_ITEM_WIDTH_LESS_THAN ||
                      item.widthCondition === FREE_ITEM_WIDTH_GREATER_EQUAL
                        ? item.widthCondition
                        : FREE_ITEM_WIDTH_ANY;
                    const threshold =
                      item.widthThreshold && item.widthThreshold > 0
                        ? item.widthThreshold
                        : DEFAULT_FREE_ITEM_WIDTH_THRESHOLD;
                    const patchRow = (patch: Partial<FreeItemRow>) => {
                      const next = [...freeItemsList];
                      next[index] = { ...item, ...patch };
                      syncFreeItems(next);
                    };
                    return (
                      <div
                        key={`free-item-${index}`}
                        className="space-y-2 rounded-xl border border-border p-2"
                      >
                        <div className="flex items-center gap-2">
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
                                patchRow({
                                  quantity: digits === "" ? 0 : Math.max(1, Number(digits)),
                                });
                              }}
                            />
                          </div>
                          <Input
                            disabled={readOnly}
                            value={item.label}
                            placeholder="e.g. Fiber Pillow"
                            className="flex-1 rounded-xl"
                            onChange={(e) => patchRow({ label: e.target.value })}
                          />
                          {!readOnly ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="rounded-xl"
                              aria-label="Remove"
                              onClick={() =>
                                syncFreeItems(
                                  freeItemsList.filter((_, rowIndex) => rowIndex !== index),
                                )
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 pl-1">
                          <span className="text-xs text-muted-foreground">Applies when width</span>
                          <Select
                            value={condition}
                            disabled={readOnly}
                            onValueChange={(v) =>
                              patchRow({
                                widthCondition:
                                  v === FREE_ITEM_WIDTH_ANY
                                    ? null
                                    : (v as FreeItemRow["widthCondition"]),
                                // Seed a sensible threshold the first time a condition is chosen.
                                widthThreshold:
                                  v === FREE_ITEM_WIDTH_ANY ? item.widthThreshold : threshold,
                              })
                            }
                          >
                            <SelectTrigger className="h-8 w-[190px] rounded-xl text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={FREE_ITEM_WIDTH_ANY}>Any width (always)</SelectItem>
                              <SelectItem value={FREE_ITEM_WIDTH_LESS_THAN}>
                                Less than…
                              </SelectItem>
                              <SelectItem value={FREE_ITEM_WIDTH_GREATER_EQUAL}>
                                Greater than or equal to…
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          {condition !== FREE_ITEM_WIDTH_ANY ? (
                            <div className="flex items-center gap-1">
                              <Input
                                type="text"
                                inputMode="decimal"
                                disabled={readOnly}
                                value={String(threshold)}
                                aria-label="Width threshold (inches)"
                                className="h-8 w-20 rounded-xl text-right text-xs"
                                onChange={(e) => {
                                  const cleaned = e.target.value.replace(/[^\d.]/g, "");
                                  patchRow({
                                    widthThreshold: cleaned === "" ? 0 : Number(cleaned),
                                  });
                                }}
                              />
                              <span className="text-xs text-muted-foreground">inches</span>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            </div>
          </div>
        </AdminSection>

        {isMattress ? (
          <AdminSection title="Per-sq.ft MRP (mattress)">
            <p className="mb-3 max-w-2xl text-xs text-muted-foreground">
              Required for mattresses — this is the ONLY place mattress MRP is set (there is no
              manual MRP). MRP = (length ÷ 12) × (width ÷ 12) × rate, using the standard (snapped)
              size. The “MRP (72&quot;×36&quot;)” column previews the MRP at the base size so you can
              check the rate. Dealer and distributor prices are derived from this MRP by the
              price-list margins above. A mattress can’t be saved or shown until every thickness has
              a rate.
            </p>
            {product.thicknesses.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Add thickness options under “Sizes &amp; thickness” first.
              </p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2.5">Thickness</th>
                      <th className="px-3 py-2.5 text-right">MRP ₹/sq.ft</th>
                      <th className="px-3 py-2.5 text-right">MRP (72&quot;×36&quot;)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {product.thicknesses.map((thickness) => {
                      const rate = sqftRateFor(thickness);
                      const previewMrp = previewMrpForRate(rate?.mrpPerSqft);
                      return (
                        <tr key={`sqft-${thickness}`} className="border-t border-border">
                          <td className="px-3 py-2 font-medium">{thickness}</td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              inputMode="decimal"
                              disabled={readOnly}
                              value={rate?.mrpPerSqft || ""}
                              onChange={(e) =>
                                patchSqftRate(thickness, Math.max(0, Number(e.target.value) || 0))
                              }
                              className="rounded-xl text-right"
                            />
                          </td>
                          {/* Live MRP preview at the base 72"×36" (18 sq.ft) size, so the admin can
                              confirm the rate produces the intended MRP. Actual MRP scales with the
                              ordered size. */}
                          <td className="px-3 py-2 text-right font-semibold tabular-nums text-muted-foreground">
                            {previewMrp > 0 ? `₹${previewMrp.toLocaleString("en-IN")}` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </AdminSection>
        ) : null}
      </TabsContent>

      <TabsContent value="catalogue">
        <AdminSection title="Catalogue layer">
          <div className="max-w-lg">
            <Label>Catalogue layer (warranty group)</Label>
            <Select
              // Warranty-less products (No guarantee) have no layer: show "None". A real layerGroup
              // wins; otherwise fall back to the guarantee unless it's No-guarantee.
              value={
                product.layerGroup ??
                (product.guarantee === NO_GUARANTEE ? NO_LAYER_VALUE : product.guarantee)
              }
              disabled={readOnly}
              onValueChange={(v) => onChange({ layerGroup: v === NO_LAYER_VALUE ? undefined : v })}
            >
              <SelectTrigger className="mt-1 rounded-2xl">
                <SelectValue placeholder="Select catalogue layer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_LAYER_VALUE}>None (no warranty layer)</SelectItem>
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
          {onDelete && (
            <Button
              variant="outline"
              className="rounded-2xl font-bold text-destructive hover:bg-destructive/10"
              onClick={onDelete}
            >
              <Trash2 className="mr-1 h-4 w-4" />
              Delete
            </Button>
          )}
        </div>
      )}
    </Tabs>
  );
}
