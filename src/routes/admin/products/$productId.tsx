import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminPermissionGate } from "@/components/admin/admin-permission-gate";
import { ConfirmActionDialog } from "@/components/shared/dialogs";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAsyncData } from "@/hooks/use-async-data";
import { useAdminPermissions } from "@/hooks/use-admin-permissions";
import { archiveProduct, getProduct, restoreProduct, saveProduct } from "@/services/admin/products";
import { ProductEditor } from "./new";

export const Route = createFileRoute("/admin/products/$productId")({
  component: EditProductPage,
});

function EditProductPage() {
  const { productId } = Route.useParams();
  const { can } = useAdminPermissions();
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [local, setLocal] = useState<Awaited<ReturnType<typeof getProduct>>>(null);

  const { loading, error, retry } = useAsyncData(async () => {
    const p = await getProduct(productId);
    setLocal(p);
    return p;
  }, [productId]);

  const readOnly = !can("catalog:write");

  const handleSave = async () => {
    if (!local) return;
    setSaving(true);
    try {
      await saveProduct(local);
      toast.success("Product saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!local) return;
    try {
      if (local.status === "active") {
        await archiveProduct(local.id);
        toast.success("Product archived");
      } else {
        await restoreProduct(local.id);
        toast.success("Product restored");
      }
      retry();
      setConfirmArchive(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
  };

  if (loading) return <PageSkeleton rows={4} />;
  if (error || !local) return <ErrorState message={error ?? "Product not found"} onRetry={retry} />;

  return (
    <div>
      <AdminPageHeader
        title={local.name}
        description={`${local.category} · ${local.guarantee}`}
        actions={
          <>
            <Badge variant={local.status === "active" ? "secondary" : "outline"} className="capitalize">
              {local.status}
            </Badge>
            <Link to="/admin/products">
              <Button variant="outline" className="rounded-2xl font-bold">← Back</Button>
            </Link>
          </>
        }
      />

      <ProductEditor
        product={local}
        onChange={(patch) => setLocal((p) => (p ? { ...p, ...patch } : p))}
        onSave={handleSave}
        onArchive={readOnly ? undefined : () => setConfirmArchive(true)}
        saving={saving}
        readOnly={readOnly}
      />

      <AdminPermissionGate permission="catalog:write">
        <ConfirmActionDialog
          open={confirmArchive}
          onOpenChange={setConfirmArchive}
          title={local.status === "active" ? "Archive product?" : "Restore product?"}
          description={
            local.status === "active"
              ? "Archived products are hidden from the dealer catalog."
              : "This product will be visible in the catalog again."
          }
          confirmLabel={local.status === "active" ? "Archive" : "Restore"}
          onConfirm={handleArchive}
          variant={local.status === "active" ? "destructive" : "default"}
        />
      </AdminPermissionGate>
    </div>
  );
}
