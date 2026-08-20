import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AdminDataTable } from "@/components/admin/admin-data-table";
import { AdminFilterTabs, AdminFiltersBar } from "@/components/admin/admin-filters-bar";
import { AdminPageHeader, AdminPrimaryButton } from "@/components/admin/admin-page-header";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { useAsyncData } from "@/hooks/use-async-data";
import { useAdminPermissions } from "@/hooks/use-admin-permissions";
import { inr } from "@/lib/demo-data";
import { listProducts } from "@/services/admin/products";

export const Route = createFileRoute("/admin/products/")({
  component: AdminProductsPage,
});

function AdminProductsPage() {
  const navigate = useNavigate();
  const { can } = useAdminPermissions();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);

  const { data, loading, error, retry } = useAsyncData(
    () => listProducts({ search, status: status as "all" | "active" | "archived", page, pageSize: 10 }),
    [search, status, page],
  );

  if (loading) return <PageSkeleton rows={4} />;
  if (error || !data) return <ErrorState message={error ?? "Failed to load products"} onRetry={retry} />;

  return (
    <div>
      <AdminPageHeader
        title="Products"
        description="Manage catalog, pricing, sizes and guarantee groups."
        actions={
          can("catalog:write") ? (
            <Link to="/admin/products/new">
              <AdminPrimaryButton>Add product</AdminPrimaryButton>
            </Link>
          ) : undefined
        }
      />

      <AdminFiltersBar search={search} onSearchChange={(v) => { setSearch(v); setPage(1); }} searchPlaceholder="Search products…">
        <AdminFilterTabs
          value={status}
          onChange={(v) => { setStatus(v); setPage(1); }}
          tabs={[
            { value: "all", label: "All" },
            { value: "active", label: "Active" },
            { value: "archived", label: "Archived" },
          ]}
        />
      </AdminFiltersBar>

      <AdminDataTable
        data={data.items}
        keyFn={(p) => p.id}
        onRowClick={(p) => navigate({ to: "/admin/products/$productId", params: { productId: p.id } })}
        emptyTitle="No products found"
        columns={[
          { key: "name", header: "Product", cell: (p) => <span className="font-bold">{p.name}</span> },
          { key: "category", header: "Category", cell: (p) => p.category },
          { key: "guarantee", header: "Guarantee", cell: (p) => p.guarantee, hideOnMobile: true },
          { key: "price", header: "MRP / Dealer", cell: (p) => `${inr(p.mrp)} / ${inr(p.dealerPrice)}`, hideOnMobile: true },
          {
            key: "status",
            header: "Status",
            cell: (p) => (
              <Badge variant={p.status === "active" ? "secondary" : "outline"} className="capitalize">
                {p.status}
              </Badge>
            ),
          },
        ]}
      />

      <AdminPagination page={data.page} totalPages={data.totalPages} onPageChange={setPage} />
    </div>
  );
}
