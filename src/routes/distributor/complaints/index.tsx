import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
    <DistributorShell title="Complaints" back="/distributor/more" showBell={false}>
      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search by ID, dealer, order or category…"
      />

      <p className="mb-4 mt-4 text-sm text-muted-foreground">
        Read-only view. Complaint status is managed by admin staff.
      </p>
      {loading && <PageSkeleton rows={4} />}
      {error && <ErrorState message={error} onRetry={retry} />}
      {!loading && !error && filtered.length === 0 && (
        <EmptyState
          title={search.trim() ? "No matching complaints" : "No complaints"}
          description={
            search.trim()
              ? "Try a different dealer name, order ID, or keyword."
              : "Complaints from your dealers will appear here."
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
                Order {c.orderId} · {c.createdAt}
              </p>
            </Link>
          ))}
        </div>
      )}
    </DistributorShell>
  );
}
