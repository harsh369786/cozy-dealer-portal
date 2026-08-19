import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DistributorShell } from "@/components/distributor-shell";
import { DealerCard } from "@/components/shared/dealer-card";
import { SearchBar, matchesSearch } from "@/components/shared/search-bar";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/shared/states";
import { useAsyncData } from "@/hooks/use-async-data";
import { getDealers } from "@/services/dealers";

export const Route = createFileRoute("/distributor/dealers/")({
  component: DealersPage,
});

function DealersPage() {
  const [search, setSearch] = useState("");
  const simulateError =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("error") === "1";

  const { data, loading, error, retry } = useAsyncData(
    () => getDealers(simulateError),
    [simulateError],
  );

  const filtered = useMemo(() => {
    if (!data) return [];
    const phoneQuery = search.replace(/\D/g, "");
    return data.filter((d) => {
      if (matchesSearch(search, d.name, d.contactName, d.code)) return true;
      if (phoneQuery.length >= 3 && d.phone.replace(/\D/g, "").includes(phoneQuery)) return true;
      return false;
    });
  }, [data, search]);

  return (
    <DistributorShell title="My Dealers">
      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search name, store, mobile, or code…"
      />

      <div className="mt-4">
        {loading && <PageSkeleton rows={4} />}
        {error && <ErrorState message={error} onRetry={retry} />}
        {!loading && !error && filtered.length === 0 && (
          <EmptyState
            title={search ? "No matching dealers" : "No dealers assigned"}
            description={
              search
                ? "Try a different dealer name, store, mobile, or code."
                : "Dealers in your territory will appear here."
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
