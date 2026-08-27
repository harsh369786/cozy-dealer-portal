import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AdminDataTable } from "@/components/admin/admin-data-table";
import { AdminFiltersBar } from "@/components/admin/admin-filters-bar";
import { AdminPageHeader, AdminPrimaryButton } from "@/components/admin/admin-page-header";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/status-badge";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { useAsyncData } from "@/hooks/use-async-data";
import { useAdminPermissions } from "@/hooks/use-admin-permissions";
import { listCampaigns } from "@/services/admin/campaigns";

export const Route = createFileRoute("/admin/campaigns/")({
  component: AdminCampaignsPage,
});

function AdminCampaignsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { can } = useAdminPermissions();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data, loading, error, retry } = useAsyncData(
    () => listCampaigns({ search, page, pageSize: 10 }),
    [search, page],
  );

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
        ]}
      />

      <AdminPagination page={data.page} totalPages={data.totalPages} onPageChange={setPage} />
    </div>
  );
}
