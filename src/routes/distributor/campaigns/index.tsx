import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DistributorShell } from "@/components/distributor-shell";
import { CampaignCard } from "@/components/shared/campaign-card";
import { SearchBar, matchesSearch } from "@/components/shared/search-bar";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/shared/states";
import { useAsyncData } from "@/hooks/use-async-data";
import type { CampaignStatus } from "@/lib/mock/distributor/types";
import { getCampaigns } from "@/services/campaigns";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/distributor/campaigns/")({
  component: CampaignsPage,
});

const campaignTabs: { id: CampaignStatus; label: string }[] = [
  { id: "active", label: "Active" },
  { id: "upcoming", label: "Upcoming" },
  { id: "expired", label: "Expired" },
];

function CampaignsPage() {
  const [tab, setTab] = useState<CampaignStatus>("active");
  const [search, setSearch] = useState("");
  const simulateError =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("error") === "1";

  const { data, loading, error, retry } = useAsyncData(
    () => getCampaigns(simulateError, tab),
    [simulateError, tab],
  );

  const filtered = useMemo(
    () =>
      data?.filter(
        (c) =>
          c.status === tab &&
          matchesSearch(search, c.name, c.product, c.description, c.discountLabel, c.status),
      ) ?? [],
    [data, tab, search],
  );

  return (
    <DistributorShell title="Campaigns" back="/distributor/more" showBell={false}>
      <SearchBar value={search} onChange={setSearch} placeholder="Search campaigns…" />

      <div className="mt-4 flex gap-2 rounded-2xl bg-secondary p-1">
        {campaignTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "press flex-1 rounded-xl py-2.5 text-sm font-bold",
              tab === t.id ? "bg-card shadow-soft" : "text-muted-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {loading && <PageSkeleton rows={3} />}
        {error && <ErrorState message={error} onRetry={retry} />}
        {!loading && !error && filtered.length === 0 && (
          <EmptyState
            title={search.trim() ? "No matching campaigns" : `No ${tab} campaigns`}
            description={
              search.trim()
                ? "Try a different campaign name or product."
                : "Campaigns in this category will appear here."
            }
          />
        )}
        {!loading && !error && filtered.length > 0 && (
          <div className="space-y-3">
            {filtered.map((c) => (
              <CampaignCard key={c.id} campaign={c} />
            ))}
          </div>
        )}
      </div>
    </DistributorShell>
  );
}
