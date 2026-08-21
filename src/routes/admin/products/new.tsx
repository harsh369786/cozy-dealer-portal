import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
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
      toast.error(e instanceof Error ? e.message : "Save failed");
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
            <div>
              <Label>Dealer price (₹)</Label>
              <Input
                type="number"
                value={product.dealerPrice || ""}
                disabled={readOnly}
                onChange={(e) => onChange({ dealerPrice: Number(e.target.value) })}
                className="mt-1 rounded-2xl"
              />
            </div>
            <div>
              <Label>Reward % of MRP</Label>
              <Input
                type="number"
                step="0.1"
                value={product.rewardPercent || ""}
                disabled={readOnly}
                onChange={(e) => onChange({ rewardPercent: Number(e.target.value) })}
                className="mt-1 rounded-2xl"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Points = {Math.round(product.mrp * (product.rewardPercent / 100))} per unit at current MRP
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
            <div>
              <Label>Legacy points (display)</Label>
              <Input
                type="number"
                value={product.points || ""}
                disabled
                className="mt-1 rounded-2xl"
              />
            </div>
            <div>
              <Label>Free items label</Label>
              <Input
                value={product.freeItems ?? ""}
                disabled={readOnly}
                onChange={(e) => onChange({ freeItems: e.target.value })}
                className="mt-1 rounded-2xl"
              />
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
            {saving ? "Saving…" : "Save product"}
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
