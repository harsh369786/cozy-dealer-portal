import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AdminDataTable } from "@/components/admin/admin-data-table";
import { AdminFilterTabs, AdminFiltersBar } from "@/components/admin/admin-filters-bar";
import { AdminPageHeader, AdminPrimaryButton } from "@/components/admin/admin-page-header";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAsyncData } from "@/hooks/use-async-data";
import { useAdminPermissions } from "@/hooks/use-admin-permissions";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useFormat } from "@/hooks/use-format";
import { listProducts } from "@/services/admin/products";

export const Route = createFileRoute("/admin/products/")({
  component: AdminProductsPage,
});

function AdminProductsPage() {
  const { t } = useTranslation();
  const { formatCurrency } = useFormat();
  const navigate = useNavigate();
  const { can } = useAdminPermissions();
  const [searchInput, setSearchInput] = useState("");
  const search = useDebouncedValue(searchInput, 350);
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);

  const statusTabs = useMemo(
    () => [
      { value: "all", label: t("common.all") },
      { value: "active", label: t("common.active") },
      { value: "archived", label: t("common.archived") },
    ],
    [t],
  );

  const { data, loading, error, retry } = useAsyncData(
    () => listProducts({ search, status: status as "all" | "active" | "archived", page, pageSize: 10 }),
    [search, status, page],
  );

  if (loading && !data) return <PageSkeleton rows={4} />;
  if (error && !data) {
    return <ErrorState message={error ?? t("errors.failedToLoadProducts")} onRetry={retry} />;
  }

  return (
    <div>
      <AdminPageHeader
        title={t("admin.products.title")}
        description={t("admin.products.description")}
        actions={
          <div className="flex flex-wrap gap-2">
            {can("catalog:read") && (
              <Link to="/admin/pricing/sqft-rates">
                <Button variant="outline" className="rounded-lg font-bold">Sq ft rates</Button>
              </Link>
            )}
            {can("catalog:write") && (
              <Link to="/admin/products/new">
                <AdminPrimaryButton>{t("admin.products.addProduct")}</AdminPrimaryButton>
              </Link>
            )}
          </div>
        }
      />

      <AdminFiltersBar
        search={searchInput}
        onSearchChange={(v) => {
          setSearchInput(v);
          setPage(1);
        }}
        searchPlaceholder={t("admin.products.searchPlaceholder")}
      >
        <AdminFilterTabs
          value={status}
          onChange={(v) => { setStatus(v); setPage(1); }}
          tabs={statusTabs}
        />
      </AdminFiltersBar>

      <AdminDataTable
        data={data?.items ?? []}
        keyFn={(p) => p.id}
        onRowClick={(p) => navigate({ to: "/admin/products/$productId", params: { productId: p.id } })}
        emptyTitle={t("admin.products.noProducts")}
        columns={[
          { key: "name", header: t("admin.products.columnProduct"), cell: (p) => <span className="font-bold">{p.name}</span> },
          { key: "category", header: t("admin.products.columnCategory"), cell: (p) => p.category },
          { key: "guarantee", header: t("admin.products.columnGuarantee"), cell: (p) => p.guarantee, hideOnMobile: true },
          {
            key: "price",
            header: t("admin.products.columnPrice"),
            cell: (p) => `${formatCurrency(p.mrp)} / ${formatCurrency(p.dealerPrice)}`,
            hideOnMobile: true,
          },
          {
            key: "status",
            header: t("common.status"),
            cell: (p) => (
              <Badge variant={p.status === "active" ? "secondary" : "outline"} className="capitalize">
                {p.status === "active" ? t("common.active") : t("common.archived")}
              </Badge>
            ),
          },
        ]}
      />

      {data && (
        <AdminPagination page={data.page} totalPages={data.totalPages} onPageChange={setPage} />
      )}
    </div>
  );
}
