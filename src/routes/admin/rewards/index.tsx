import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
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
import { listRewardCatalog, saveRewardItem } from "@/services/admin/rewards";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/rewards/")({
  component: AdminRewardsPage,
});

function AdminRewardsPage() {
  const navigate = useNavigate();
  const { can } = useAdminPermissions();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data, loading, error, retry } = useAsyncData(
    () => listRewardCatalog({ search, page, pageSize: 10 }),
    [search, page],
  );

  const toggleActive = async (id: string, active: boolean) => {
    const item = data?.items.find((r) => r.id === id);
    if (!item || !can("catalog:write")) return;
    try {
      await saveRewardItem({ ...item, active });
      toast.success(active ? "Reward activated" : "Reward deactivated");
      retry();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  };

  if (loading) return <PageSkeleton rows={4} />;
  if (error || !data) return <ErrorState message={error ?? "Failed to load rewards"} onRetry={retry} />;

  return (
    <div>
      <AdminPageHeader
        title="Rewards"
        description="Manage the reward catalogue and delivery claims."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/admin/rewards/claims">
              <Button variant="outline" className="rounded-2xl font-bold">
                View claims
              </Button>
            </Link>
            {can("catalog:write") && (
              <Link to="/admin/rewards/new">
                <AdminPrimaryButton>Add reward</AdminPrimaryButton>
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
        searchPlaceholder="Search rewards…"
      />

      <AdminDataTable
        data={data.items}
        keyFn={(r) => r.id}
        onRowClick={(r) => navigate({ to: "/admin/rewards/$rewardId", params: { rewardId: r.id } })}
        emptyTitle="No rewards in catalogue"
        columns={[
          { key: "emoji", header: "", cell: (r) => <span className="text-xl">{r.emoji}</span> },
          { key: "name", header: "Reward", cell: (r) => <span className="font-bold">{r.name}</span> },
          { key: "points", header: "Points", cell: (r) => r.pointsRequired.toLocaleString("en-IN") },
          {
            key: "active",
            header: "Active",
            cell: (r) => (
              <AdminPermissionGate
                permission="catalog:write"
                fallback={
                  <Badge variant={r.active ? "secondary" : "outline"}>{r.active ? "Yes" : "No"}</Badge>
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
