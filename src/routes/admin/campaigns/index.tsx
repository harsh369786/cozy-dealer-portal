import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AdminDataTable } from "@/components/admin/admin-data-table";
import { AdminFilterTabs, AdminFiltersBar } from "@/components/admin/admin-filters-bar";
import { AdminPageHeader, AdminPrimaryButton } from "@/components/admin/admin-page-header";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/status-badge";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { useAsyncData } from "@/hooks/use-async-data";
import { useAdminPermissions } from "@/hooks/use-admin-permissions";
import type { CampaignType } from "@/lib/mock/admin/types";
import { listCampaigns } from "@/services/admin/campaigns";

export const Route = createFileRoute("/admin/campaigns/")({
  component: AdminCampaignsPage,
});

const TYPE_TABS: Array<{ value: CampaignType | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "price", label: "Price" },
  { value: "sell", label: "Sell volume" },
  { value: "distributor", label: "Distributor" },
];

function AdminCampaignsPage() {
  const navigate = useNavigate();
  const { can } = useAdminPermissions();
  const [search, setSearch] = useState("");
  const [type, setType] = useState<CampaignType | "all">("all");
  const [page, setPage] = useState(1);

  const { data, loading, error, retry } = useAsyncData(
    () => listCampaigns({ search, type, page, pageSize: 10 }),
    [search, type, page],
  );

  if (loading) return <PageSkeleton rows={4} />;
  if (error || !data) return <ErrorState message={error ?? "Failed to load campaigns"} onRetry={retry} />;

  return (
    <div>
      <AdminPageHeader
        title="Campaigns"
        description="Price campaigns, sell-volume goals and distributor broadcasts."
        actions={
          can("campaigns:write") ? (
            <Link to="/admin/campaigns/new">
              <AdminPrimaryButton>Create campaign</AdminPrimaryButton>
            </Link>
          ) : undefined
        }
      />

      <AdminFiltersBar search={search} onSearchChange={(v) => { setSearch(v); setPage(1); }}>
        <AdminFilterTabs value={type} onChange={(v) => { setType(v as CampaignType | "all"); setPage(1); }} tabs={TYPE_TABS} />
      </AdminFiltersBar>

      <AdminDataTable
        data={data.items}
        keyFn={(c) => c.id}
        onRowClick={(c) => navigate({ to: "/admin/campaigns/$campaignId", params: { campaignId: c.id } })}
        emptyTitle="No campaigns found"
        columns={[
          { key: "name", header: "Campaign", cell: (c) => <span className="font-bold">{c.name}</span> },
          { key: "product", header: "Product", cell: (c) => c.product },
          {
            key: "offer",
            header: "Offer",
            cell: (c) =>
              c.discountPercent
                ? `${c.discountPercent}% off`
                : c.goal ?? c.badgeLabel ?? "—",
            hideOnMobile: true,
          },
          { key: "dates", header: "Dates", cell: (c) => `${c.startDate} – ${c.endDate}`, hideOnMobile: true },
          { key: "status", header: "Status", cell: (c) => <StatusBadge kind="campaign" status={c.status} /> },
          {
            key: "live",
            header: "Live",
            cell: (c) => (
              <Badge variant={c.active ? "secondary" : "outline"}>{c.active ? "Yes" : "No"}</Badge>
            ),
            hideOnMobile: true,
          },
        ]}
      />

      <AdminPagination page={data.page} totalPages={data.totalPages} onPageChange={setPage} />
    </div>
  );
}
