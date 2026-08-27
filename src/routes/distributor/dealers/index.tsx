import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { DistributorShell } from "@/components/distributor-shell";
import { DealerCard } from "@/components/shared/dealer-card";
import { SearchBar, matchesSearch } from "@/components/shared/search-bar";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/shared/states";
import { useAsyncData } from "@/hooks/use-async-data";
import { cn } from "@/lib/utils";
import { getDealers } from "@/services/dealers";

export const Route = createFileRoute("/distributor/dealers/")({
  component: DealersPage,
});

type ActiveFilter = "all" | "active" | "inactive";

function DealersPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");
  const [sortByName, setSortByName] = useState(false);
  const simulateError =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("error") === "1";

  const { data, loading, error, retry } = useAsyncData(
    () =>
      getDealers(simulateError, {
        active: activeFilter === "all" ? undefined : activeFilter,
        sort: sortByName ? "name" : undefined,
      }),
    [simulateError, activeFilter, sortByName],
  );

  const filtered = useMemo(() => {
    if (!data) return [];
    const phoneQuery = search.replace(/\D/g, "");
    return data.filter((d) => {
      if (matchesSearch(search, d.name, d.contactName, d.code, d.location)) return true;
      if (phoneQuery.length >= 3 && d.phone.replace(/\D/g, "").includes(phoneQuery)) return true;
      return false;
    });
  }, [data, search]);

  return (
    <DistributorShell title={t("distributor.dealers.title")}>
      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder={t("distributor.dealers.searchPlaceholder")}
      />

      <div className="mt-4 flex flex-wrap gap-2">
        {(
          [
            ["all", t("common.all")],
            ["active", t("common.active")],
            ["inactive", t("common.inactive")],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveFilter(id)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm font-bold",
              activeFilter === id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card",
            )}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setSortByName((on) => !on)}
          className={cn(
            "rounded-lg border px-3 py-1.5 text-sm font-bold",
            sortByName ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card",
          )}
        >
          {t("common.name")}
        </button>
      </div>

      <div className="mt-4">
        {loading && <PageSkeleton rows={4} />}
        {error && <ErrorState message={error} onRetry={retry} />}
        {!loading && !error && filtered.length === 0 && (
          <EmptyState
            title={search ? t("distributor.dealers.noMatchingDealers") : t("distributor.dealers.noDealersAssigned")}
            description={
              search ? t("distributor.dealers.noMatchingDealersDesc") : t("distributor.dealers.noDealersDesc")
            }
          />
        )}
        {!loading && !error && filtered.length > 0 && (
          <div className="space-y-3">
            {filtered.map((dealer) => (
              <DealerCard key={dealer.id} dealer={dealer} />
            ))}
          </div>
        )}
      </div>
    </DistributorShell>
  );
}
