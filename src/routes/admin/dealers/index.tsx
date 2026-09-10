import { useState } from "react";
import { useTranslation } from "react-i18next";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminPermissionGate } from "@/components/admin/admin-permission-gate";
import { SearchBar } from "@/components/shared/search-bar";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/shared/states";
import { useAsyncData } from "@/hooks/use-async-data";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useFormat } from "@/hooks/use-format";
import { getDealers } from "@/services/dealers";

export const Route = createFileRoute("/admin/dealers/")({
  component: AdminDealersPage,
});

function AdminDealersPage() {
  return (
    <AdminPermissionGate permission="dealers:read">
      <DealersContent />
    </AdminPermissionGate>
  );
}

function DealersContent() {
  const { t } = useTranslation();
  const { formatCurrency, formatNumber } = useFormat();
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, 300);

  const { data, loading, error, retry } = useAsyncData(
    () => getDealers(false, { search: debounced || undefined, sort: "name" }),
    [debounced],
  );

  const dealers = data ?? [];

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={t("admin.dealers.title")}
        description={t("admin.dealers.description")}
      />
      <SearchBar value={search} onChange={setSearch} placeholder={t("admin.dealers.searchPlaceholder")} />

      {loading && !data ? (
        <PageSkeleton rows={6} />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={retry} />
      ) : dealers.length === 0 ? (
        <EmptyState title={t("admin.dealers.empty")} />
      ) : (
        <div className="space-y-2">
          {dealers.map((dealer) => (
            <Link
              key={dealer.id}
              to="/admin/dealers/$dealerId"
              params={{ dealerId: dealer.id }}
              search={{ tab: "overview" }}
              className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-soft hover:bg-secondary/40"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold">{dealer.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {dealer.code}
                  {dealer.location ? ` · ${dealer.location}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <div className="text-right">
                  <p className="text-sm font-semibold">{formatCurrency(dealer.totalSales)}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatNumber(dealer.orderCount)} {t("admin.dealers.orders")}
                  </p>
                </div>
                <Badge variant={dealer.active ? "secondary" : "outline"}>
                  {dealer.active ? t("common.active") : t("common.inactive")}
                </Badge>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
