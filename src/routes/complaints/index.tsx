import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/app-shell";
import { OrderHelpPanel } from "@/components/shared/order-help-panel";
import { SearchBar, matchesSearch } from "@/components/shared/search-bar";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/shared/states";
import { requireRoles } from "@/lib/auth-guard";
import type { ComplaintStatus } from "@/lib/mock/distributor/types";
import { useAsyncData } from "@/hooks/use-async-data";
import { useFormat } from "@/hooks/use-format";
import { getComplaints } from "@/services/complaints";

export const Route = createFileRoute("/complaints/")({
  beforeLoad: () => requireRoles(["dealer"]),
  component: DealerComplaintsPage,
});

function DealerComplaintsPage() {
  const { t } = useTranslation();
  const { formatTimestamp } = useFormat();
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const { data, loading, error, retry } = useAsyncData(() => getComplaints(), []);

  const filtered = useMemo(
    () =>
      data?.filter((c) =>
        matchesSearch(search, c.id, c.orderId, c.category, c.description, c.status),
      ) ?? [],
    [data, search],
  );

  return (
    <AppShell title={t("dealer.complaints.title")} back="/orders">
      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder={t("common.searchComplaints")}
      />

      <button
        type="button"
        onClick={() => setShowNew((v) => !v)}
        className="press mt-4 w-full rounded-2xl border border-primary bg-primary/10 py-3 text-sm font-bold text-primary"
      >
        {showNew ? t("common.hideNewRequestForm") : t("common.newHelpRequest")}
      </button>

      {showNew && <OrderHelpPanel allowOrderLookup onSubmitted={() => { setShowNew(false); retry(); }} />}

      <p className="mb-4 mt-4 text-sm text-muted-foreground">{t("common.trackHelpRequests")}</p>

      {loading && <PageSkeleton rows={4} />}
      {error && <ErrorState message={error} onRetry={retry} />}
      {!loading && !error && filtered.length === 0 && (
        <EmptyState
          title={search.trim() ? t("common.noMatchingRequests") : t("common.noHelpRequestsYet")}
          description={
            search.trim()
              ? t("common.noMatchingRequestsHint")
              : t("common.noHelpRequestsHint")
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
                  <p className="font-display font-bold">{c.complaintNumber ?? c.id}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("dealer.complaints.orderLabel", { orderId: c.orderId })}
                  </p>
                </div>
                <StatusBadge kind="complaint" status={c.status as ComplaintStatus} />
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{c.description}</p>
              <p className="mt-2 text-xs text-muted-foreground">{formatTimestamp(c.createdAt)}</p>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
