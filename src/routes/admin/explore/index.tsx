import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { AdminDataTable } from "@/components/admin/admin-data-table";
import { AdminFiltersBar } from "@/components/admin/admin-filters-bar";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminPermissionGate } from "@/components/admin/admin-permission-gate";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { useAsyncData } from "@/hooks/use-async-data";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { inr } from "@/lib/demo-data";
import type { OrderStatus } from "@/lib/mock/distributor/types";
import { exploreAdminData } from "@/services/admin/reports";

export const Route = createFileRoute("/admin/explore/")({
  validateSearch: (s: Record<string, unknown>) => ({
    metric: (s.metric as string) || "sales",
    distributorId: (s.distributorId as string) || undefined,
    dealerId: (s.dealerId as string) || undefined,
  }),
  component: AdminExplorePage,
});

function AdminExplorePage() {
  const { metric, distributorId, dealerId } = Route.useSearch();
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState("");
  const search = useDebouncedValue(searchInput, 350);

  const level = dealerId ? "orders" : distributorId ? "dealers" : "distributors";

  const { data, loading, error, retry } = useAsyncData(
    () =>
      exploreAdminData({
        level,
        distributorId,
        dealerId,
        search,
      }),
    [level, distributorId, dealerId, search],
  );

  const title =
    level === "orders" ? "Orders" : level === "dealers" ? "Dealers" : metric === "orders" ? "Orders by distributor" : "Sales by distributor";

  const breadcrumbs = [
    { label: "Dashboard", to: "/admin" as const },
    { label: "Explore", to: "/admin/explore" as const, search: { metric } },
    ...(distributorId
      ? [{ label: "Dealers", to: "/admin/explore" as const, search: { metric, distributorId } }]
      : []),
    ...(dealerId ? [{ label: "Orders", to: "/admin/explore" as const, search: { metric, distributorId, dealerId } }] : []),
  ];

  if (loading && !data) return <PageSkeleton rows={4} />;
  if (error && !data) return <ErrorState message={error ?? "Failed to load data"} onRetry={retry} />;

  return (
    <AdminPermissionGate permission="reports:read">
      <div className="space-y-4">
        <AdminPageHeader
          title={title}
          description="Drill down from network → distributor → dealer → individual orders."
        />

        <nav className="flex flex-wrap items-center gap-1 text-sm">
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.label} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              <Link
                to={crumb.to}
                search={crumb.search}
                className="font-semibold text-primary hover:underline"
              >
                {crumb.label}
              </Link>
            </span>
          ))}
        </nav>

        <AdminFiltersBar
          search={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder={
            level === "orders" ? "Search order ID…" : level === "dealers" ? "Search dealer…" : "Search distributor…"
          }
        />

        {level === "distributors" && (
          <AdminDataTable
            data={(data?.items ?? []) as Array<Record<string, unknown>>}
            keyFn={(r) => String(r.id)}
            onRowClick={(r) =>
              navigate({ to: "/admin/explore", search: { metric, distributorId: String(r.id) } })
            }
            emptyTitle="No distributors found"
            columns={[
              { key: "name", header: "Distributor", cell: (r) => <span className="font-bold">{String(r.name)}</span> },
              { key: "dealers", header: "Dealers", cell: (r) => String(r.dealerCount ?? 0), hideOnMobile: true },
              { key: "orders", header: "Orders", cell: (r) => String(r.orders ?? 0) },
              { key: "sales", header: "Sales", cell: (r) => inr(Number(r.sales ?? 0)) },
            ]}
          />
        )}

        {level === "dealers" && (
          <AdminDataTable
            data={(data?.items ?? []) as Array<Record<string, unknown>>}
            keyFn={(r) => String(r.id)}
            onRowClick={(r) =>
              navigate({
                to: "/admin/explore",
                search: { metric, distributorId, dealerId: String(r.id) },
              })
            }
            emptyTitle="No dealers found"
            columns={[
              { key: "name", header: "Dealer", cell: (r) => <span className="font-bold">{String(r.name)}</span> },
              { key: "code", header: "Code", cell: (r) => String(r.code ?? "—"), hideOnMobile: true },
              { key: "orders", header: "Orders", cell: (r) => String(r.orders ?? 0) },
              { key: "sales", header: "Sales", cell: (r) => inr(Number(r.sales ?? 0)) },
            ]}
          />
        )}

        {level === "orders" && (
          <AdminDataTable
            data={(data?.items ?? []) as Array<Record<string, unknown>>}
            keyFn={(r) => String(r.id)}
            onRowClick={(r) =>
              navigate({ to: "/admin/orders/$orderId", params: { orderId: String(r.id) } })
            }
            emptyTitle="No orders found"
            columns={[
              { key: "id", header: "Order", cell: (r) => <span className="font-bold">#{String(r.id)}</span> },
              { key: "placed", header: "Placed", cell: (r) => String(r.placedAt ?? "—"), hideOnMobile: true },
              { key: "status", header: "Status", cell: (r) => <StatusBadge kind="order" status={String(r.status) as OrderStatus} /> },
              { key: "qty", header: "Items", cell: (r) => String(r.quantity ?? 0), hideOnMobile: true },
              { key: "value", header: "Value", cell: (r) => inr(Number(r.value ?? 0)) },
            ]}
          />
        )}
      </div>
    </AdminPermissionGate>
  );
}
