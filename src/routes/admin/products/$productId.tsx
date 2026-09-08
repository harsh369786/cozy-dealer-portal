import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminPermissionGate } from "@/components/admin/admin-permission-gate";
import { ConfirmActionDialog } from "@/components/shared/dialogs";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAsyncData } from "@/hooks/use-async-data";
import { useAdminPermissions } from "@/hooks/use-admin-permissions";
import { archiveProduct, deleteProduct, getProduct, restoreProduct, saveProduct } from "@/services/admin/products";
import { ProductEditor } from "./new";
import { parseFreeItemRules } from "../../../../shared/free-item-rules";

/**
 * Parse the stored free-items value (JSON array or legacy plain text) into editor rows, preserving
 * the optional per-row width condition + threshold so the editor round-trips them. Delegates to the
 * shared rule parser (single source of truth).
 */
function parseFreeItemsList(value?: string | null) {
  return parseFreeItemRules(value).map((rule) => ({
    label: rule.label,
    quantity: rule.quantity,
    widthCondition: rule.widthCondition ?? null,
    widthThreshold: rule.widthThreshold ?? null,
  }));
}

export const Route = createFileRoute("/admin/products/$productId")({
  component: EditProductPage,
});

function EditProductPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { productId } = Route.useParams();
  const { can } = useAdminPermissions();
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [local, setLocal] = useState<Awaited<ReturnType<typeof getProduct>>>(null);

  const { loading, error, retry } = useAsyncData(async () => {
    const p = await getProduct(productId);
    setLocal(p ? { ...p, freeItemsList: parseFreeItemsList(p.freeItems) } : p);
    return p;
  }, [productId]);

  const readOnly = !can("catalog:write");

  const handleSave = async () => {
    if (!local) return;
    setSaving(true);
    try {
      await saveProduct(local);
      toast.success(t("common.save"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("errors.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!local) return;
    try {
      if (local.status === "active") {
        await archiveProduct(local.id);
        toast.success(t("common.archived"));
      } else {
        await restoreProduct(local.id);
        toast.success(t("common.activate"));
      }
      retry();
      setConfirmArchive(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("errors.saveFailed"));
    }
  };

  const handleDelete = async () => {
    if (!local) return;
    setDeleting(true);
    try {
      await deleteProduct(local.id);
      toast.success(t("common.deleted"));
      setConfirmDelete(false);
      // The product is gone from every list now — return to the products list.
      navigate({ to: "/admin/products" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("errors.saveFailed"));
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <PageSkeleton rows={4} />;
  if (error || !local) return <ErrorState message={error ?? t("common.productNotFound")} onRetry={retry} />;

  return (
    <div>
      <AdminPageHeader
        title={local.name}
        description={`${local.category} · ${local.guarantee}`}
        actions={
          <>
            <Badge variant={local.status === "active" ? "secondary" : "outline"} className="capitalize">
              {local.status === "active" ? t("common.active") : t("common.archived")}
            </Badge>
            <Link to="/admin/products">
              <Button variant="outline" className="rounded-2xl font-bold">{t("common.backToHome")}</Button>
            </Link>
          </>
        }
      />

      <ProductEditor
        product={local}
        onChange={(patch) => setLocal((p) => (p ? { ...p, ...patch } : p))}
        onSave={handleSave}
        onArchive={readOnly ? undefined : () => setConfirmArchive(true)}
        onDelete={readOnly ? undefined : () => setConfirmDelete(true)}
        saving={saving}
        readOnly={readOnly}
      />

      <AdminPermissionGate permission="catalog:write">
        <ConfirmActionDialog
          open={confirmArchive}
          onOpenChange={setConfirmArchive}
          title={local.status === "active" ? t("common.deactivate") : t("common.activate")}
          description={t("admin.products.description")}
          confirmLabel={local.status === "active" ? t("common.deactivate") : t("common.activate")}
          onConfirm={handleArchive}
          variant={local.status === "active" ? "destructive" : "default"}
        />
        <ConfirmActionDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={t("common.deleteProduct")}
          description={t("common.deleteProductConfirm")}
          confirmLabel={deleting ? t("common.deleting") : t("common.delete")}
          onConfirm={handleDelete}
          variant="destructive"
        />
      </AdminPermissionGate>
    </div>
  );
}
