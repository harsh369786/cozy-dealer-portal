import { Plus, Trash2 } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { AdminPrimaryButton } from "@/components/admin/admin-page-header";
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
import { listPricingTiers } from "@/services/admin/pricing-tiers";
import { calculateDistributorPrice } from "@/lib/distributor-price";
import { calculateRewardPoints } from "../../../shared/reward-points";

export function emptyProduct(): AdminProduct {
  return {
    id: `prod-${Date.now()}`,
    name: "",
    category: "Mattresses",
    guarantee: "5 Years",
    thicknesses: ['6"'],
    thicknessPrices: [{ thickness: '6"', mrp: 0, dealerPrice: 0 }],
    mrp: 0,
    dealerPrice: 0,
    points: 0,
    rewardPercent: 0,
    rewardEligibility: "dealer",
    rewardRuleActive: true,
    freeItemsList: [],
    blurb: "",
    image: "",
    status: "active",
    layerGroup: "5 Years",
  };
}

export function normalizeProductForSave(product: AdminProduct): AdminProduct {
  const thicknesses = product.thicknesses.map((value) => value.trim()).filter(Boolean);
  return {
    ...product,
    thicknesses,
    thicknessPrices: (product.thicknessPrices ?? []).filter((row) =>
      thicknesses.includes(row.thickness.trim()),
    ),
    freeItemsList: (product.freeItemsList ?? [])
      .map((item) => ({
        label: item.label.trim(),
        quantity: Math.max(1, item.quantity || 1),
      }))
      .filter((item) => item.label),
  };
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
  const thicknessPrices = product.thicknessPrices ?? [];
  const freeItemsList = product.freeItemsList ?? [];

  useEffect(() => {
    if (readOnly || (product.tierPrices && product.tierPrices.length > 0)) return;
    let cancelled = false;
    listPricingTiers()
      .then((res) => {
        if (cancelled || !res.items.length) return;
        onChange({
          tierPrices: res.items.map((tier) => ({
            tierId: tier.id,
            code: tier.code,
            name: tier.name,
            dealerPrice: product.dealerPrice || 0,
            distributorMarginPercent: tier.distributorMarginPercent,
            distributorPrice: 0,
          })),
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // Seed once when the editor mounts without tier rows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id, readOnly]);

  function setThicknesses(nextThicknesses: string[]) {
    const cleaned = nextThicknesses.map((value) => value.trim());
    const existing = product.thicknessPrices ?? [];
    const nextPrices = cleaned.map((thickness, index) => {
      const prev =
        existing.find((row) => row.thickness === thickness) ??
        (index < existing.length ? existing[index] : undefined);
      return {
        thickness,
        mrp: prev?.mrp,
        dealerPrice: prev?.dealerPrice,
      };
    });
    onChange({ thicknesses: cleaned, thicknessPrices: nextPrices });
  }

  function addThicknessRow() {
    setThicknesses([...product.thicknesses, ""]);
  }

  function updateThicknessAt(index: number, value: string) {
    const next = [...product.thicknesses];
    next[index] = value;
    setThicknesses(next);
  }

  function removeThicknessAt(index: number) {
    setThicknesses(product.thicknesses.filter((_, rowIndex) => rowIndex !== index));
  }

  function updateFreeItemQuantity(index: number, raw: string) {
    const digits = raw.replace(/\D/g, "");
    const next = [...freeItemsList];
    next[index] = {
      ...freeItemsList[index]!,
      quantity: digits === "" ? 0 : Math.max(1, Number(digits)),
    };
    onChange({ freeItemsList: next });
  }

  function normalizeFreeItemQuantity(index: number) {
    const item = freeItemsList[index];
    if (!item || item.quantity >= 1) return;
    const next = [...freeItemsList];
    next[index] = { ...item, quantity: 1 };
    onChange({ freeItemsList: next });
  }

  function updateThicknessPrice(
    thickness: string,
    patch: Partial<{ mrp: number; dealerPrice: number }>,
  ) {
    const existing = thicknessPrices.find((row) => row.thickness === thickness);
    if (existing) {
      onChange({
        thicknessPrices: thicknessPrices.map((row) =>
          row.thickness === thickness ? { ...row, ...patch } : row,
        ),
      });
      return;
    }
    onChange({
      thicknessPrices: [
        ...thicknessPrices,
        { thickness, mrp: product.mrp, dealerPrice: product.dealerPrice, ...patch },
      ],
    });
  }

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
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Label>Thickness options</Label>
                {!readOnly ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-xl"
                    onClick={addThicknessRow}
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Add thickness
                  </Button>
                ) : null}
              </div>
              {product.thicknesses.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Add each thickness separately, e.g. 5&quot;, 6&quot;, 8&quot;.
                </p>
              ) : (
                <div className="space-y-2">
                  {product.thicknesses.map((thickness, index) => (
                    <div key={`thickness-${index}`} className="flex gap-2">
                      <Input
                        disabled={readOnly}
                        value={thickness}
                        placeholder='e.g. 6"'
                        onChange={(e) => updateThicknessAt(index, e.target.value)}
                        className="flex-1 rounded-xl"
                      />
                      {!readOnly ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="rounded-xl"
                          onClick={() => removeThicknessAt(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {product.thicknesses.some((value) => value.trim()) ? (
              <div className="space-y-3">
                <Label>Price by thickness (72″ × 36″ base)</Label>
                <p className="text-xs text-muted-foreground">
                  Leave blank to use the base MRP / dealer price with automatic thickness scaling.
                </p>
                <div className="space-y-2">
                  {product.thicknesses
                    .filter((value) => value.trim())
                    .map((thickness) => {
                      const row = thicknessPrices.find((entry) => entry.thickness === thickness);
                      return (
                        <div
                          key={thickness}
                          className="grid gap-2 rounded-2xl border border-border/60 p-3 sm:grid-cols-[1fr_1fr_1fr]"
                        >
                          <div className="flex items-center text-sm font-semibold">{thickness}</div>
                          <Input
                            type="number"
                            disabled={readOnly}
                            placeholder={`MRP (${product.mrp || "base"})`}
                            value={row?.mrp || ""}
                            onChange={(e) =>
                              updateThicknessPrice(thickness, {
                                mrp: e.target.value ? Number(e.target.value) : undefined,
                              })
                            }
                            className="rounded-xl"
                          />
                          <Input
                            type="number"
                            disabled={readOnly}
                            placeholder={`Dealer (${product.dealerPrice || "base"})`}
                            value={row?.dealerPrice || ""}
                            onChange={(e) =>
                              updateThicknessPrice(thickness, {
                                dealerPrice: e.target.value ? Number(e.target.value) : undefined,
                              })
                            }
                            className="rounded-xl"
                          />
                        </div>
                      );
                    })}
                </div>
              </div>
            ) : null}
          </div>
        </AdminSection>
      </TabsContent>

      <TabsContent value="pricing">
        <AdminSection title="Pricing & rewards">
          <div className="grid max-w-lg gap-4 sm:grid-cols-2">
            <div>
              <Label>MRP (₹)</Label>
              <Input
                type="number"
                value={product.mrp || ""}
                disabled={readOnly}
                onChange={(e) => onChange({ mrp: Number(e.target.value) })}
                className="mt-1 rounded-2xl"
              />
            </div>
            <div className="sm:col-span-2 space-y-3">
              <Label>Pricing tiers</Label>
              <p className="text-xs text-muted-foreground">
                Enter dealer price per tier. Distributor margin is set on the tier. Distributor price is calculated as
                Dealer Price ÷ (1 + margin/100) and rounded to the nearest rupee.
              </p>
              {(product.tierPrices ?? []).length === 0 ? (
                <div>
                  <Label>Dealer price (₹) — T1</Label>
                  <Input
                    type="number"
                    value={product.dealerPrice || ""}
                    disabled={readOnly}
                    onChange={(e) => onChange({ dealerPrice: Number(e.target.value) })}
                    className="mt-1 rounded-2xl"
                  />
                </div>
              ) : (
                <div className="-mx-1 overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase text-muted-foreground">
                        <th className="px-1 py-2">Tier</th>
                        <th className="px-1 py-2">MRP</th>
                        <th className="px-1 py-2">Dealer price</th>
                        <th className="px-1 py-2">Dist. margin %</th>
                        <th className="px-1 py-2">Distributor price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(product.tierPrices ?? []).map((tier, index) => {
                        const dealerPrice = tier.dealerPrice || 0;
                        const distPrice = calculateDistributorPrice(
                          dealerPrice,
                          tier.distributorMarginPercent,
                        );
                        return (
                          <tr key={tier.tierId} className="border-t border-border/70">
                            <td className="px-1 py-2 font-semibold">{tier.code}</td>
                            <td className="px-1 py-2">{product.mrp || "—"}</td>
                            <td className="px-1 py-2">
                              <Input
                                type="number"
                                disabled={readOnly}
                                value={tier.dealerPrice || ""}
                                className="rounded-xl"
                                onChange={(e) => {
                                  const next = [...(product.tierPrices ?? [])];
                                  const value = Number(e.target.value);
                                  next[index] = { ...tier, dealerPrice: value };
                                  const t1 = next.find((row) => row.tierId === "tier-t1");
                                  onChange({
                                    tierPrices: next,
                                    dealerPrice: t1?.dealerPrice ?? product.dealerPrice,
                                  });
                                }}
                              />
                            </td>
                            <td className="px-1 py-2">{tier.distributorMarginPercent}%</td>
                            <td className="px-1 py-2 font-bold">{Number.isFinite(distPrice) ? distPrice : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="sm:col-span-2">
              <Label>Reward percentage of dealer price</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Points = round((dealer price × percent) / 10). ₹1 of that reward value = 10 points.
              </p>
              <Input
                type="number"
                min={0}
                step="0.1"
                disabled={readOnly}
                value={product.rewardPercent}
                className="mt-1 rounded-2xl"
                onChange={(e) => {
                  const rewardPercent = Number(e.target.value);
                  const percent = Number.isFinite(rewardPercent) ? Math.max(0, rewardPercent) : 0;
                  onChange({
                    rewardPercent: percent,
                    points: calculateRewardPoints(product.dealerPrice, percent, 1),
                  });
                }}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {calculateRewardPoints(product.dealerPrice, product.rewardPercent, 1)} points per unit at the
                current dealer price (₹{product.dealerPrice || 0})
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
            <div className="flex items-center gap-2">
              <Checkbox
                checked={product.rewardRuleActive}
                disabled={readOnly}
                onCheckedChange={(v) => onChange({ rewardRuleActive: Boolean(v) })}
              />
              <Label>Reward rule active</Label>
            </div>
            <div className="sm:col-span-2 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Label>Free items</Label>
                {!readOnly ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-xl"
                    onClick={() =>
                      onChange({
                        freeItemsList: [...freeItemsList, { label: "", quantity: 1 }],
                      })
                    }
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
                      <div className="w-24 shrink-0">
                        <Label className="sr-only">Quantity</Label>
                        <Input
                          type="text"
                          inputMode="numeric"
                          disabled={readOnly}
                          value={item.quantity > 0 ? String(item.quantity) : ""}
                          placeholder="Qty"
                          onChange={(e) => updateFreeItemQuantity(index, e.target.value)}
                          onBlur={() => normalizeFreeItemQuantity(index)}
                          className="rounded-xl"
                          aria-label="Quantity"
                        />
                      </div>
                      <Input
                        disabled={readOnly}
                        value={item.label}
                        placeholder="e.g. Fiber Pillows"
                        onChange={(e) => {
                          const next = [...freeItemsList];
                          next[index] = { ...item, label: e.target.value };
                          onChange({ freeItemsList: next });
                        }}
                        className="flex-1 rounded-xl"
                      />
                      {!readOnly ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="rounded-xl"
                          onClick={() =>
                            onChange({
                              freeItemsList: freeItemsList.filter((_, rowIndex) => rowIndex !== index),
                            })
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
