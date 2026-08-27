import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { DistributorShell } from "@/components/distributor-shell";
import { SearchBar, matchesSearch } from "@/components/shared/search-bar";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/shared/states";
import { useAsyncData } from "@/hooks/use-async-data";
import { getComplaints } from "@/services/complaints";

export const Route = createFileRoute("/distributor/complaints/")({
  component: ComplaintsPage,
});

function ComplaintsPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const simulateError =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("error") === "1";

  const { data, loading, error, retry } = useAsyncData(
    () => getComplaints(simulateError),
    [simulateError],
  );

  const filtered = useMemo(
    () =>
      data?.filter((c) =>
        matchesSearch(search, c.id, c.orderId, c.dealerName, c.category, c.description, c.status),
      ) ?? [],
    [data, search],
  );

  return (
    <DistributorShell title={t("distributor.complaints.title")} back="/distributor/more" showBell={false}>
      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder={t("distributor.complaints.searchPlaceholder")}
      />

      <p className="mb-4 mt-4 text-sm text-muted-foreground">
        {t("distributor.complaints.readOnlyNote")}
      </p>
      {loading && <PageSkeleton rows={4} />}
      {error && <ErrorState message={error} onRetry={retry} />}
      {!loading && !error && filtered.length === 0 && (
        <EmptyState
          title={search.trim() ? t("distributor.complaints.noMatching") : t("distributor.complaints.noComplaints")}
          description={
            search.trim() ? t("distributor.complaints.noMatchingDesc") : t("distributor.complaints.noComplaintsDesc")
          }
        />
      )}
      {!loading && !error && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((c) => (
            <Link
              key={c.id}
              to="/distributor/complaints/$complaintId"
              params={{ complaintId: c.id }}
              className="press block rounded-3xl border border-border bg-card p-4 shadow-soft"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-display font-bold">{c.id}</p>
                  <p className="text-sm text-muted-foreground">{c.dealerName}</p>
                </div>
                <StatusBadge kind="complaint" status={c.status} />
              </div>
              <p className="mt-2 text-sm font-semibold">{c.category}</p>
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{c.description}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("distributor.complaints.orderMeta", { orderId: c.orderId, date: c.createdAt })}
              </p>
            </Link>
          ))}
        </div>
      )}
    </DistributorShell>
  );
}
