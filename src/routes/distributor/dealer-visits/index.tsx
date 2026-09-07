import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { MapPin } from "lucide-react";
import { DistributorShell } from "@/components/distributor-shell";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/shared/states";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useAsyncData } from "@/hooks/use-async-data";
import { useFormat } from "@/hooks/use-format";
import { listVisits, getVisitSummary } from "@/services/visits";

export const Route = createFileRoute("/distributor/dealer-visits/")({
  component: DealerVisitsPage,
});

function formatDuration(minutes: number | undefined) {
  if (minutes == null) return "—";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/** YYYY-MM-DD for the first day of the current month / start of the current week (Mon). */
function startOfMonthIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function startOfWeekIso() {
  const d = new Date();
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - day);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function mapsLink(lat?: number, lng?: number) {
  if (lat == null || lng == null) return null;
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

function DealerVisitsPage() {
  const { t } = useTranslation();
  const { formatTimestamp } = useFormat();

  const [salesExec, setSalesExec] = useState("all");
  const [dealer, setDealer] = useState("all");
  const [status, setStatus] = useState<"all" | "active" | "completed">("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Summary drives the top stat cards AND the Sales-Executive / Dealer filter option lists —
  // both are already scoped to this distributor's sales executives by the backend.
  const summaryQuery = useAsyncData(() => getVisitSummary(), []);

  const listQuery = useAsyncData(
    () =>
      listVisits({
        status,
        salesExecutiveUserId: salesExec !== "all" ? salesExec : undefined,
        dealerId: dealer !== "all" ? dealer : undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        pageSize: 50,
      }),
    [status, salesExec, dealer, fromDate, toDate],
  );

  const summary = summaryQuery.data;
  const items = useMemo(() => listQuery.data?.items ?? [], [listQuery.data]);

  // Filter option lists derived from the (distributor-scoped) summary.
  const execOptions = summary?.bySalesExecutive ?? [];
  const dealerOptions = useMemo(
    () => (summary?.byStore ?? []).filter((s) => s.dealerId),
    [summary],
  );

  // This-week / this-month counts computed from the summary's monthly trend is not granular
  // enough, so derive them from lightweight scoped list calls.
  const weekQuery = useAsyncData(
    () => listVisits({ status: "all", fromDate: startOfWeekIso(), pageSize: 1 }),
    [],
  );
  const monthQuery = useAsyncData(
    () => listVisits({ status: "all", fromDate: startOfMonthIso(), pageSize: 1 }),
    [],
  );

  if (summaryQuery.loading && !summary) {
    return (
      <DistributorShell title={t("distributor.dealerVisits.title")} showBell={false}>
        <PageSkeleton rows={5} />
      </DistributorShell>
    );
  }
  if (summaryQuery.error && !summary) {
    return (
      <DistributorShell title={t("distributor.dealerVisits.title")} showBell={false}>
        <ErrorState message={summaryQuery.error} onRetry={summaryQuery.retry} />
      </DistributorShell>
    );
  }

  const activeSeCount = (summary?.bySalesExecutive ?? []).filter((s) => s.visits > 0).length;

  return (
    <DistributorShell title={t("distributor.dealerVisits.title")} showBell={false}>
      {/* Summary stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label={t("distributor.dealerVisits.totalVisits")} value={summary?.total ?? 0} />
        <StatCard
          label={t("distributor.dealerVisits.thisMonth")}
          value={monthQuery.data?.total ?? 0}
        />
        <StatCard
          label={t("distributor.dealerVisits.thisWeek")}
          value={weekQuery.data?.total ?? 0}
        />
        <StatCard label={t("distributor.dealerVisits.activeSalesExecs")} value={activeSeCount} />
        <StatCard label={t("visitStatus.completed")} value={summary?.completed ?? 0} />
        <StatCard
          label={t("distributor.dealerVisits.storesVisited")}
          value={summary?.uniqueStores ?? 0}
        />
      </div>

      {/* Visits per Sales Executive */}
      {execOptions.length > 0 && (
        <section className="mt-5 rounded-3xl border border-border bg-card p-4 shadow-soft">
          <h3 className="mb-2 font-display font-bold">
            {t("distributor.dealerVisits.visitsPerSalesExec")}
          </h3>
          <ul className="space-y-2">
            {execOptions.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between rounded-2xl bg-secondary/40 px-3 py-2 text-sm"
              >
                <span className="font-bold">{row.name}</span>
                <span className="text-muted-foreground">
                  {row.completed}/{row.visits} {t("visitStatus.completed").toLowerCase()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Filters */}
      <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="min-w-0">
          <Label className="text-xs">{t("distributor.dealerVisits.salesExecutive")}</Label>
          <SearchableSelect
            className="mt-1"
            value={salesExec}
            onValueChange={setSalesExec}
            searchPlaceholder={t("common.search")}
            options={[
              { value: "all", label: t("common.all") },
              ...execOptions.map((e) => ({ value: e.id, label: e.name })),
            ]}
          />
        </div>
        <div className="min-w-0">
          <Label className="text-xs">{t("common.dealer")}</Label>
          <SearchableSelect
            className="mt-1"
            value={dealer}
            onValueChange={setDealer}
            searchPlaceholder={t("common.search")}
            options={[
              { value: "all", label: t("common.all") },
              ...dealerOptions.map((d) => ({ value: d.dealerId!, label: d.storeName })),
            ]}
          />
        </div>
        <div className="min-w-0">
          <Label className="text-xs">{t("common.status")}</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger className="mt-1 rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all")}</SelectItem>
              <SelectItem value="active">{t("visitStatus.active")}</SelectItem>
              <SelectItem value="completed">{t("visitStatus.completed")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="v-from" className="text-xs">
              {t("common.from")}
            </Label>
            <Input
              id="v-from"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="mt-1 rounded-lg"
            />
          </div>
          <div>
            <Label htmlFor="v-to" className="text-xs">
              {t("common.to")}
            </Label>
            <Input
              id="v-to"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="mt-1 rounded-lg"
            />
          </div>
        </div>
      </section>

      {/* Visit list */}
      <div className="mt-5">
        {listQuery.loading && <PageSkeleton rows={4} />}
        {listQuery.error && <ErrorState message={listQuery.error} onRetry={listQuery.retry} />}
        {!listQuery.loading && !listQuery.error && items.length === 0 && (
          <EmptyState
            title={t("distributor.visits.noVisitsYet")}
            description={t("distributor.dealerVisits.noVisitsDesc")}
          />
        )}
        {!listQuery.loading && !listQuery.error && items.length > 0 && (
          <div className="space-y-3">
            {items.map((v) => {
              const checkInMap = mapsLink(v.checkInLat, v.checkInLng);
              const checkOutMap = mapsLink(v.checkOutLat, v.checkOutLng);
              return (
                <article
                  key={v.id}
                  className="rounded-3xl border border-border bg-card p-4 shadow-soft"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-display font-bold">{v.storeName}</p>
                      <p className="text-sm text-muted-foreground">{v.dealerName}</p>
                      {v.salesExecutiveName ? (
                        <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                          <MapPin className="h-3.5 w-3.5" />
                          {v.salesExecutiveName}
                        </p>
                      ) : null}
                    </div>
                    <StatusBadge kind="visit" status={v.status} />
                  </div>
                  <dl className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2">
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">{t("common.mobile")}</dt>
                      <dd className="font-medium">{v.mobile}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">
                        {t("distributor.visits.durationLabel")}
                      </dt>
                      <dd className="font-medium">{formatDuration(v.durationMinutes)}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-muted-foreground">{t("common.address")}</dt>
                      <dd className="font-medium">{v.address}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">
                        {t("distributor.visits.checkInLabel")}
                      </dt>
                      <dd className="text-right font-medium">
                        {formatTimestamp(v.checkInAt)}
                        {checkInMap ? (
                          <a
                            href={checkInMap}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-1 text-primary underline"
                          >
                            {t("distributor.dealerVisits.map")}
                          </a>
                        ) : null}
                      </dd>
                    </div>
                    {v.checkOutAt ? (
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">
                          {t("distributor.visits.checkOutLabel")}
                        </dt>
                        <dd className="text-right font-medium">
                          {formatTimestamp(v.checkOutAt)}
                          {checkOutMap ? (
                            <a
                              href={checkOutMap}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-1 text-primary underline"
                            >
                              {t("distributor.dealerVisits.map")}
                            </a>
                          ) : null}
                        </dd>
                      </div>
                    ) : null}
                    {v.notes ? (
                      <div className="sm:col-span-2">
                        <dt className="text-muted-foreground">
                          {t("distributor.dealerVisits.notes")}
                        </dt>
                        <dd className="font-medium">{v.notes}</dd>
                      </div>
                    ) : null}
                  </dl>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </DistributorShell>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-3 py-2.5 text-center shadow-soft">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-display text-xl font-bold">{value}</p>
    </div>
  );
}
