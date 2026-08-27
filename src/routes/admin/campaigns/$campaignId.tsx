import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmActionDialog } from "@/components/shared/dialogs";
import { useAsyncData } from "@/hooks/use-async-data";
import { useAdminPermissions } from "@/hooks/use-admin-permissions";
import { activateCampaign, deactivateCampaign, getCampaign, saveCampaign } from "@/services/admin/campaigns";
import { CampaignForm } from "./new";

export const Route = createFileRoute("/admin/campaigns/$campaignId")({
  component: EditCampaignPage,
});

function EditCampaignPage() {
  const { t } = useTranslation();
  const { campaignId } = Route.useParams();  const { can } = useAdminPermissions();
  const [local, setLocal] = useState<Awaited<ReturnType<typeof getCampaign>>>(null);
  const [saving, setSaving] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [toggleLoading, setToggleLoading] = useState(false);

  const { loading, error, retry } = useAsyncData(async () => {
    const c = await getCampaign(campaignId);
    setLocal(c);
    return c;
  }, [campaignId]);

  const readOnly = !can("campaigns:write");

  const handleSave = async () => {
    if (!local) return;
    setSaving(true);
    try {
      await saveCampaign(local);
      toast.success(t("common.save"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("errors.saveFailed"));    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async () => {
    setToggleLoading(true);
    try {
      if (local?.active) {
        await deactivateCampaign(campaignId);
        toast.success(t("common.deactivate"));
        setLocal({ ...local, active: false, status: "expired" });
      } else {
        await activateCampaign(campaignId);
        toast.success(t("common.activate"));
        retry();
      }
      setDeactivateOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("errors.saveFailed"));    } finally {
      setToggleLoading(false);
    }
  };

  if (loading) return <PageSkeleton rows={3} />;
  if (error || !local) return <ErrorState message={error ?? t("errors.notFound")} onRetry={retry} />;
  return (
    <div>
      <AdminPageHeader
        title={local.name}
        description={local.product}
        actions={
          <>
            <StatusBadge kind="campaign" status={local.status} />
            <Badge variant={local.active ? "secondary" : "outline"}>
              {local.active ? t("common.active") : t("common.inactive")}
            </Badge>
            {!readOnly && (
              <Button
                variant={local.active ? "destructive" : "default"}
                className="rounded-2xl font-bold"
                onClick={() => (local.active ? setDeactivateOpen(true) : handleToggleActive())}
                disabled={toggleLoading}
              >
                {local.active ? t("common.deactivate") : t("common.activate")}
              </Button>
            )}
            <Link to="/admin/campaigns">
              <Button variant="outline" className="rounded-2xl font-bold">{t("common.backToHome")}</Button>            </Link>
          </>
        }
      />
      <CampaignForm
        campaign={local}
        onChange={setLocal}
        onSave={handleSave}
        saving={saving}
        readOnly={readOnly}
      />
      <ConfirmActionDialog
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
        title={t("admin.campaigns.deactivateTitle")}
        description={t("admin.campaigns.deactivateDescription")}
        confirmLabel={t("common.deactivate")}        onConfirm={handleToggleActive}
        loading={toggleLoading}
        variant="destructive"
      />
    </div>
  );
}
