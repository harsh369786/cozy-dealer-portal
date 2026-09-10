import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { AdminDataTable } from "@/components/admin/admin-data-table";
import { AdminFiltersBar } from "@/components/admin/admin-filters-bar";
import { AdminPageHeader, AdminPrimaryButton } from "@/components/admin/admin-page-header";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmActionDialog } from "@/components/shared/dialogs";
import { StatusBadge } from "@/components/shared/status-badge";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { useAsyncData } from "@/hooks/use-async-data";
import { useAdminPermissions } from "@/hooks/use-admin-permissions";
import type { AdminCampaign } from "@/lib/mock/admin/types";
import { deleteCampaign, listCampaigns } from "@/services/admin/campaigns";

export const Route = createFileRoute("/admin/campaigns/")({
  component: AdminCampaignsPage,
});

function AdminCampaignsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { can } = useAdminPermissions();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pendingDelete, setPendingDelete] = useState<AdminCampaign | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data, loading, error, retry } = useAsyncData(
    () => listCampaigns({ search, page, pageSize: 10 }),
    [search, page],
  );

  const canWrite = can("campaigns:write");

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      // Soft-delete (existing archive mechanism) — removes the campaign from listings; the
      // associated products and every other campaign are left untouched.
      await deleteCampaign(pendingDelete.id);
      toast.success(t("admin.campaigns.deleted"));
      setPendingDelete(null);
      retry();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("errors.saveFailed"));
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <PageSkeleton rows={4} />;
  if (error || !data) {
    return <ErrorState message={error ?? t("errors.somethingWentWrong")} onRetry={retry} />;
  }

  return (
    <div>
      <AdminPageHeader
        title={t("admin.campaigns.title")}
        description={t("admin.campaigns.campaignDetails")}
        actions={
          can("campaigns:write") ? (
            <Link to="/admin/campaigns/new">
              <AdminPrimaryButton>{t("admin.campaigns.createTitle")}</AdminPrimaryButton>
            </Link>
          ) : undefined
        }
      />

      <AdminFiltersBar search={search} onSearchChange={(v) => { setSearch(v); setPage(1); }} />

      <AdminDataTable
        data={data.items}
        keyFn={(c) => c.id}
        onRowClick={(c) => navigate({ to: "/admin/campaigns/$campaignId", params: { campaignId: c.id } })}
        emptyTitle={t("common.noMatchingResults")}
        columns={[
          { key: "name", header: t("admin.campaigns.title"), cell: (c) => <span className="font-bold">{c.name}</span> },
          { key: "product", header: t("common.product"), cell: (c) => c.product },
          {
            key: "offer",
            header: t("common.specialOffer"),
            cell: (c) =>
              c.discountPercent
                ? t("common.percentOff", { percent: c.discountPercent })
                : c.badgeLabel ?? "—",
            hideOnMobile: true,
          },
          { key: "dates", header: t("common.deliveryDate"), cell: (c) => `${c.startDate} – ${c.endDate}`, hideOnMobile: true },
          { key: "status", header: t("common.status"), cell: (c) => <StatusBadge kind="campaign" status={c.status} /> },
          {
            key: "live",
            header: t("common.active"),
            cell: (c) => (
              <Badge variant={c.active ? "secondary" : "outline"}>{c.active ? t("common.yes") : t("common.no")}</Badge>
            ),
            hideOnMobile: true,
          },
          ...(canWrite
            ? [
                {
                  key: "actions",
                  header: "",
                  className: "text-right",
                  cell: (c: AdminCampaign) => (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="rounded-xl text-destructive"
                      aria-label={t("admin.campaigns.delete")}
                      onClick={(e) => {
                        // Don't trigger the row's navigate.
                        e.stopPropagation();
                        setPendingDelete(c);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ),
                },
              ]
            : []),
        ]}
      />

      <AdminPagination page={data.page} totalPages={data.totalPages} onPageChange={setPage} />

      <ConfirmActionDialog
        open={pendingDelete != null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={t("admin.campaigns.deleteTitle")}
        description={t("admin.campaigns.deleteDescription")}
        confirmLabel={t("admin.campaigns.delete")}
        onConfirm={handleDelete}
        loading={deleting}
        variant="destructive"
      />
    </div>
  );
}
