import { createFileRoute } from "@tanstack/react-router";

import { useMemo, useState } from "react";

import { useTranslation } from "react-i18next";

import { DistributorShell } from "@/components/distributor-shell";

import { StatusBadge } from "@/components/shared/status-badge";

import { EmptyState, ErrorState, PageSkeleton } from "@/components/shared/states";

import { Input } from "@/components/ui/input";

import { Label } from "@/components/ui/label";

import { useAsyncData } from "@/hooks/use-async-data";

import { useFormat } from "@/hooks/use-format";

import { listVisits } from "@/services/visits";



export const Route = createFileRoute("/distributor/visits/history")({

  component: VisitHistoryPage,

});



function formatDuration(minutes: number | undefined) {

  if (minutes == null) return "—";

  if (minutes < 60) return `${minutes} min`;

  const h = Math.floor(minutes / 60);

  const m = minutes % 60;

  return m > 0 ? `${h}h ${m}m` : `${h}h`;

}



function VisitHistoryPage() {

  const { t } = useTranslation();

  const { formatTimestamp } = useFormat();

  const [fromDate, setFromDate] = useState("");

  const [toDate, setToDate] = useState("");



  const { data, loading, error, retry } = useAsyncData(

    () =>

      listVisits({

        status: "all",

        fromDate: fromDate || undefined,

        toDate: toDate || undefined,

        pageSize: 50,

      }),

    [fromDate, toDate],

  );



  const items = useMemo(() => data?.items ?? [], [data]);



  return (

    <DistributorShell title={t("distributor.visits.visitHistory")} back="/distributor/visits" showBell={false}>

      <div className="mb-4 grid grid-cols-2 gap-3">

        <div className="space-y-1">

          <Label htmlFor="from-date" className="text-xs">

            {t("common.from")}

          </Label>

          <Input

            id="from-date"

            type="date"

            value={fromDate}

            onChange={(e) => setFromDate(e.target.value)}

            className="rounded-xl"

          />

        </div>

        <div className="space-y-1">

          <Label htmlFor="to-date" className="text-xs">

            {t("common.deliveryDate")}

          </Label>

          <Input

            id="to-date"

            type="date"

            value={toDate}

            onChange={(e) => setToDate(e.target.value)}

            className="rounded-xl"

          />

        </div>

      </div>



      {loading && <PageSkeleton rows={4} />}

      {error && <ErrorState message={error} onRetry={retry} />}

      {!loading && !error && items.length === 0 && (

        <EmptyState

          title={t("distributor.visits.noVisitsYet")}

          description={t("distributor.visits.noVisitsDesc")}

        />

      )}

      {!loading && !error && items.length > 0 && (

        <div className="space-y-3">

          {items.map((v) => (

            <article

              key={v.id}

              className="rounded-3xl border border-border bg-card p-4 shadow-soft"

            >

              <div className="flex items-start justify-between gap-2">

                <div className="min-w-0">

                  <p className="font-display font-bold">{v.dealerName}</p>

                  <p className="text-sm text-muted-foreground">{v.storeName}</p>

                </div>

                <StatusBadge kind="visit" status={v.status} />

              </div>

              <dl className="mt-3 grid gap-1.5 text-sm">

                <div className="flex justify-between gap-2">

                  <dt className="text-muted-foreground">{t("common.mobile")}</dt>

                  <dd className="font-medium">{v.mobile}</dd>

                </div>

                <div>

                  <dt className="text-muted-foreground">{t("common.address")}</dt>

                  <dd className="font-medium">{v.address}</dd>

                </div>

                <div className="flex justify-between gap-2">

                  <dt className="text-muted-foreground">{t("distributor.visits.checkInLabel")}</dt>

                  <dd className="text-right font-medium">{formatTimestamp(v.checkInAt)}</dd>

                </div>

                {v.checkOutAt && (

                  <div className="flex justify-between gap-2">

                    <dt className="text-muted-foreground">{t("distributor.visits.checkOutLabel")}</dt>

                    <dd className="text-right font-medium">{formatTimestamp(v.checkOutAt)}</dd>

                  </div>

                )}

                <div className="flex justify-between gap-2">

                  <dt className="text-muted-foreground">{t("distributor.visits.durationLabel")}</dt>

                  <dd className="font-medium">{formatDuration(v.durationMinutes)}</dd>

                </div>

              </dl>

              {v.notes && (

                <p className="mt-3 line-clamp-3 rounded-2xl bg-secondary/50 p-3 text-sm">{v.notes}</p>

              )}

            </article>

          ))}

        </div>

      )}

    </DistributorShell>

  );

}


