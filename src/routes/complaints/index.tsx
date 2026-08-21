import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { SearchBar, matchesSearch } from "@/components/shared/search-bar";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/shared/states";
import { requireRoles } from "@/lib/auth-guard";
import type { ComplaintStatus } from "@/lib/mock/distributor/types";
import { useAsyncData } from "@/hooks/use-async-data";
import { getComplaints } from "@/services/complaints";

export const Route = createFileRoute("/complaints/")({
  beforeLoad: () => requireRoles(["dealer"]),
  component: DealerComplaintsPage,
});

function DealerComplaintsPage() {
  const [search, setSearch] = useState("");
  const { data, loading, error, retry } = useAsyncData(() => getComplaints(), []);

  const filtered = useMemo(
    () =>
      data?.filter((c) =>
        matchesSearch(search, c.id, c.orderId, c.category, c.description, c.status),
      ) ?? [],
    [data, search],
  );

  return (
    <AppShell title="Help Requests" back="/orders">
      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search by ID, order or description…"
      />

      <p className="mb-4 mt-4 text-sm text-muted-foreground">
        Track status of help requests you submitted from your orders.
      </p>

      {loading && <PageSkeleton rows={4} />}
      {error && <ErrorState message={error} onRetry={retry} />}
      {!loading && !error && filtered.length === 0 && (
        <EmptyState
          title={search.trim() ? "No matching requests" : "No help requests yet"}
          description={
            search.trim()
              ? "Try a different ID, order number, or keyword."
              : "Open an order and tap Need Help? to submit a request."
          }
        />
      )}
      {!loading && !error && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((c) => (
            <Link
              key={c.id}
              to="/complaints/$complaintId"
              params={{ complaintId: c.id }}
              className="press block rounded-3xl border border-border bg-card p-4 shadow-soft"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-display font-bold">{c.id}</p>
                  <p className="text-sm text-muted-foreground">Order {c.orderId}</p>
                </div>
                <StatusBadge kind="complaint" status={c.status as ComplaintStatus} />
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{c.description}</p>
              <p className="mt-2 text-xs text-muted-foreground">{c.createdAt}</p>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
