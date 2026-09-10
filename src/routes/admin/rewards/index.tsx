import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { AdminDataTable } from "@/components/admin/admin-data-table";
import { AdminFiltersBar } from "@/components/admin/admin-filters-bar";
import { AdminPageHeader, AdminPrimaryButton } from "@/components/admin/admin-page-header";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminPermissionGate } from "@/components/admin/admin-permission-gate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { Switch } from "@/components/ui/switch";
import { useAsyncData } from "@/hooks/use-async-data";
import { useAdminPermissions } from "@/hooks/use-admin-permissions";
import { useFormat } from "@/hooks/use-format";
import { listRewardCatalog, saveRewardItem } from "@/services/admin/rewards";

export const Route = createFileRoute("/admin/rewards/")({
  component: AdminRewardsPage,
});

function AdminRewardsPage() {
  const { t } = useTranslation();
  const { formatNumber } = useFormat();
  const navigate = useNavigate();
  const { can } = useAdminPermissions();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // Main catalogue lists Normal (standard) rewards. Target Based rewards live on /admin/rewards/additional.
  const { data, loading, error, retry } = useAsyncData(
    () => listRewardCatalog({ search, page, pageSize: 10, kind: "standard" }),
    [search, page],
  );

  const toggleActive = async (id: string, active: boolean) => {
    const item = data?.items.find((r) => r.id === id);
    if (!item || !can("catalog:write")) return;
    try {
      await saveRewardItem({ ...item, active });
      toast.success(active ? t("common.activate") : t("common.deactivate"));
      retry();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("errors.saveFailed"));
    }
  };

  if (loading) return <PageSkeleton rows={4} />;
  if (error || !data) {
    return <ErrorState message={error ?? t("errors.somethingWentWrong")} onRetry={retry} />;
  }

  return (
    <div>
      <AdminPageHeader
        title={t("admin.rewards.title")}
        description={t("admin.rewards.description")}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/admin/rewards/additional">
              <Button variant="outline" className="rounded-2xl font-bold">
                {t("admin.rewards.additionalRewards")}
              </Button>
            </Link>
            <Link to="/admin/rewards/claims">
              <Button variant="outline" className="rounded-2xl font-bold">
                {t("admin.rewards.claims")}
              </Button>
            </Link>
            {can("catalog:write") && (
              <Link to="/admin/rewards/new">
                <AdminPrimaryButton>{t("admin.rewards.addReward")}</AdminPrimaryButton>
              </Link>
            )}
          </div>
        }
      />

      <AdminFiltersBar
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        searchPlaceholder={t("common.search")}
      />

      <AdminDataTable
        data={data.items}
        keyFn={(r) => r.id}
        onRowClick={(r) => navigate({ to: "/admin/rewards/$rewardId", params: { rewardId: r.id } })}
        emptyTitle={t("common.noRewardsAvailable")}
        columns={[
          { key: "emoji", header: "", cell: (r) => <span className="text-xl">{r.emoji}</span> },
          { key: "name", header: t("admin.rewards.title"), cell: (r) => <span className="font-bold">{r.name}</span> },
          { key: "points", header: t("common.points"), cell: (r) => formatNumber(r.pointsRequired) },
          {
            key: "active",
            header: t("common.active"),
            cell: (r) => (
              <AdminPermissionGate
                permission="catalog:write"
                fallback={
                  <Badge variant={r.active ? "secondary" : "outline"}>{r.active ? t("common.yes") : t("common.no")}</Badge>
                }
              >
                <Switch
                  checked={r.active}
                  onCheckedChange={(v) => toggleActive(r.id, v)}
                  onClick={(e) => e.stopPropagation()}
                />
              </AdminPermissionGate>
            ),
          },
        ]}
      />

      <AdminPagination page={data.page} totalPages={data.totalPages} onPageChange={setPage} />
    </div>
  );
}
