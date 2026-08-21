import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AdminDataTable } from "@/components/admin/admin-data-table";
import { AdminFilterTabs, AdminFiltersBar } from "@/components/admin/admin-filters-bar";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { StatusBadge } from "@/components/shared/status-badge";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { useAsyncData } from "@/hooks/use-async-data";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { inr } from "@/lib/demo-data";
import type { OrderStatus } from "@/lib/mock/distributor/types";
import { listOrders } from "@/services/admin/orders";

export const Route = createFileRoute("/admin/orders/")({
  validateSearch: (s: Record<string, unknown>) => ({
    status: (s.status as OrderStatus | "all") || undefined,
  }),
  component: AdminOrdersPage,
});

const STATUS_TABS: Array<{ value: OrderStatus | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "order_placed", label: "Order placed" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "in_making", label: "In making" },
  { value: "out_for_delivery", label: "Out for delivery" },
  { value: "delivered", label: "Delivered" },
];

function AdminOrdersPage() {
  const navigate = useNavigate();
  const { status: statusFromUrl } = Route.useSearch();
  const [searchInput, setSearchInput] = useState("");
  const search = useDebouncedValue(searchInput, 350);
  const [status, setStatus] = useState<OrderStatus | "all">(statusFromUrl ?? "all");
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (statusFromUrl) setStatus(statusFromUrl);
  }, [statusFromUrl]);

  const { data, loading, error, retry } = useAsyncData(
    () => listOrders({ search, status, page, pageSize: 10 }),
    [search, status, page],
  );

  if (loading && !data) return <PageSkeleton rows={4} />;
  if (error && !data) return <ErrorState message={error ?? "Failed to load orders"} onRetry={retry} />;

  return (
    <div>
      <AdminPageHeader title="Orders" description="View and manage all orders across the network." />

      <AdminFiltersBar
        search={searchInput}
        onSearchChange={(v) => {
          setSearchInput(v);
          setPage(1);
        }}
        searchPlaceholder="Search by order ID, dealer or store…"
      >
        <AdminFilterTabs
          value={status}
          onChange={(v) => {
            setStatus(v as OrderStatus | "all");
            setPage(1);
          }}
          tabs={STATUS_TABS}
        />
      </AdminFiltersBar>

      <AdminDataTable
        data={data?.items ?? []}
        keyFn={(o) => o.id}
        onRowClick={(o) => navigate({ to: "/admin/orders/$orderId", params: { orderId: o.id } })}
        emptyTitle="No orders found"
        columns={[
          { key: "id", header: "Order", cell: (o) => <span className="font-bold">#{o.id}</span> },
          { key: "dealer", header: "Dealer", cell: (o) => o.dealerName },
          { key: "distributor", header: "Distributor", cell: (o) => o.distributorName, hideOnMobile: true },
          { key: "status", header: "Status", cell: (o) => <StatusBadge kind="order" status={o.status} /> },
          { key: "placed", header: "Placed", cell: (o) => o.placedAt, hideOnMobile: true },
          { key: "value", header: "Value", cell: (o) => inr(o.totalValue) },
        ]}
      />

      {data && (
        <AdminPagination page={data.page} totalPages={data.totalPages} onPageChange={setPage} />
      )}
    </div>
  );
}
