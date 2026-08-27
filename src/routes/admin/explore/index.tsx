import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AdminDataTable } from "@/components/admin/admin-data-table";
import { AdminFiltersBar } from "@/components/admin/admin-filters-bar";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminPermissionGate } from "@/components/admin/admin-permission-gate";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { useAsyncData } from "@/hooks/use-async-data";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useFormat } from "@/hooks/use-format";
import type { OrderStatus } from "@/lib/mock/distributor/types";
import { exploreAdminData, type ExploreLevel } from "@/services/admin/reports";
import { getDealerById, getDealerPerformance } from "@/services/dealers";

export const Route = createFileRoute("/admin/explore/")({
  validateSearch: (s: Record<string, unknown>) => ({
    metric: (s.metric as string) || "sales",
    level: (s.level as ExploreLevel) || undefined,
    distributorId: (s.distributorId as string) || undefined,
    dealerId: (s.dealerId as string) || undefined,
  }),
  component: AdminExplorePage,
});

function AdminExplorePage() {
  const { t } = useTranslation();
  const { formatCurrency, formatNumber } = useFormat();
  const { metric, level: searchLevel, distributorId, dealerId } = Route.useSearch();
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState("");
  const search = useDebouncedValue(searchInput, 350);

  const level: ExploreLevel = dealerId
    ? "orders"
    : distributorId
      ? "dealers"
      : searchLevel === "all_dealers"
        ? "all_dealers"
        : searchLevel ?? "distributors";

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

  const dealerProfileQuery = useAsyncData(
    () => (dealerId ? getDealerById(dealerId) : Promise.resolve(null)),
    [dealerId],
  );
  const dealerPerformanceQuery = useAsyncData(
    () => (dealerId ? getDealerPerformance(dealerId) : Promise.resolve([])),
    [dealerId],
  );

  const title =
    level === "orders"
      ? t("admin.explore.orders")
      : level === "dealers"
        ? t("admin.explore.dealers")
        : level === "all_dealers"
          ? t("admin.dashboard.dealers")
          : metric === "orders"
            ? t("admin.explore.ordersByDistributor")
            : t("admin.explore.salesByDistributor");

  const breadcrumbs = [
    { label: t("admin.explore.breadcrumbDashboard"), to: "/admin" as const },
    { label: t("admin.explore.breadcrumbExplore"), to: "/admin/explore" as const, search: { metric } },
    ...(distributorId
      ? [{ label: t("admin.explore.dealers"), to: "/admin/explore" as const, search: { metric, distributorId } }]
      : []),
    ...(dealerId
      ? [{ label: t("admin.explore.orders"), to: "/admin/explore" as const, search: { metric, distributorId, dealerId } }]
      : []),
  ];

  if (loading && !data) return <PageSkeleton rows={4} />;
  if (error && !data) return <ErrorState message={error ?? t("errors.somethingWentWrong")} onRetry={retry} />;

  return (
    <AdminPermissionGate permission="reports:read">
      <div className="space-y-4">
        <AdminPageHeader
          title={title}
          description={t("admin.reports.description", { scope: t("admin.explore.breadcrumbExplore") })}
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
            level === "orders"
              ? "Search order ID…"
              : level === "dealers" || level === "all_dealers"
                ? "Search dealer…"
                : "Search distributor…"
          }
        />

        {level === "all_dealers" && (
          <AdminDataTable
            data={(data?.items ?? []) as Array<Record<string, unknown>>}
            keyFn={(r) => String(r.id)}
            onRowClick={(r) =>
              navigate({
                to: "/admin/explore",
                search: { metric, distributorId: String(r.distributorId ?? ""), dealerId: String(r.id) },
              })
            }
            emptyTitle={t("common.noMatchingResults")}
            columns={[
              { key: "name", header: t("admin.dashboard.columnDealer"), cell: (r) => <span className="font-bold">{String(r.name)}</span> },
              { key: "code", header: t("common.code"), cell: (r) => String(r.code ?? "—"), hideOnMobile: true },
              { key: "distributor", header: t("common.distributor"), cell: (r) => String(r.distributorName ?? "—"), hideOnMobile: true },
              { key: "orders", header: t("admin.dashboard.orders"), cell: (r) => String(r.orders ?? 0) },
              { key: "sales", header: t("common.sales"), cell: (r) => formatCurrency(Number(r.sales ?? 0)) },
            ]}
          />
        )}

        {level === "distributors" && (
          <AdminDataTable
            data={(data?.items ?? []) as Array<Record<string, unknown>>}
            keyFn={(r) => String(r.id)}
            onRowClick={(r) =>
              navigate({ to: "/admin/explore", search: { metric, distributorId: String(r.id) } })
            }
            emptyTitle={t("common.noMatchingResults")}
            columns={[
              { key: "name", header: t("admin.dashboard.distributors"), cell: (r) => <span className="font-bold">{String(r.name)}</span> },
              { key: "dealers", header: t("admin.dashboard.dealers"), cell: (r) => String(r.dealerCount ?? 0), hideOnMobile: true },
              { key: "orders", header: t("admin.dashboard.orders"), cell: (r) => String(r.orders ?? 0) },
              { key: "sales", header: t("common.sales"), cell: (r) => formatCurrency(Number(r.sales ?? 0)) },
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
            emptyTitle={t("common.noMatchingResults")}
            columns={[
              { key: "name", header: t("admin.dashboard.columnDealer"), cell: (r) => <span className="font-bold">{String(r.name)}</span> },
              { key: "code", header: t("common.code"), cell: (r) => String(r.code ?? "—"), hideOnMobile: true },
              { key: "orders", header: t("admin.dashboard.orders"), cell: (r) => String(r.orders ?? 0) },
              { key: "sales", header: t("common.sales"), cell: (r) => formatCurrency(Number(r.sales ?? 0)) },
            ]}
          />
        )}

        {level === "orders" && dealerProfileQuery.data && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
              <p className="text-xs font-semibold text-muted-foreground">{t("common.sales")}</p>
              <p className="mt-1 font-display text-xl font-bold">{formatCurrency(dealerProfileQuery.data.totalSales)}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
              <p className="text-xs font-semibold text-muted-foreground">{t("admin.dashboard.salesMtd")}</p>
              <p className="mt-1 font-display text-xl font-bold">{formatCurrency(dealerProfileQuery.data.monthSales)}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
              <p className="text-xs font-semibold text-muted-foreground">{t("admin.dashboard.orders")}</p>
              <p className="mt-1 font-display text-xl font-bold">{dealerProfileQuery.data.orderCount}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
              <p className="text-xs font-semibold text-muted-foreground">{t("common.rewardPoints")}</p>
              <p className="mt-1 font-display text-xl font-bold">
                {formatNumber(dealerProfileQuery.data.rewardPoints)}
              </p>
            </div>
          </div>
        )}

        {level === "orders" && (dealerPerformanceQuery.data?.length ?? 0) > 0 && (
          <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
            <p className="font-display font-bold">{t("admin.dashboard.monthlySalesTrend")}</p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {dealerPerformanceQuery.data!.map((row) => (
                <li key={row.month} className="rounded-lg bg-secondary/50 px-3 py-2 text-sm">
                  <p className="text-xs font-semibold text-muted-foreground">{row.month}</p>
                  <p className="font-bold">{formatCurrency(row.orderValue)}</p>
                  <p className="text-xs text-muted-foreground">{row.orders} {t("common.orders")}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {level === "orders" && (
          <AdminDataTable
            data={(data?.items ?? []) as Array<Record<string, unknown>>}
            keyFn={(r) => String(r.id)}
            onRowClick={(r) =>
              navigate({ to: "/admin/orders/$orderId", params: { orderId: String(r.id) } })
            }
            emptyTitle={t("common.noMatchingResults")}
            columns={[
              { key: "id", header: t("admin.dashboard.columnOrder"), cell: (r) => <span className="font-bold">#{String(r.id)}</span> },
              { key: "placed", header: t("common.placed"), cell: (r) => String(r.placedAt ?? "—"), hideOnMobile: true },
              { key: "status", header: t("admin.dashboard.columnStatus"), cell: (r) => <StatusBadge kind="order" status={String(r.status) as OrderStatus} /> },
              { key: "qty", header: t("common.items"), cell: (r) => String(r.quantity ?? 0), hideOnMobile: true },
              { key: "value", header: t("admin.dashboard.columnValue"), cell: (r) => formatCurrency(Number(r.value ?? 0)) },
            ]}
          />
        )}
      </div>
    </AdminPermissionGate>
  );
}
