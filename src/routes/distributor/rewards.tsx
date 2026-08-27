import { createFileRoute, Link } from "@tanstack/react-router";

import { useMemo } from "react";

import { useTranslation } from "react-i18next";

import { Gift } from "lucide-react";

import { DistributorShell } from "@/components/distributor-shell";

import { EmptyState, ErrorState, PageSkeleton } from "@/components/shared/states";

import { useAsyncData } from "@/hooks/use-async-data";

import { useFormat } from "@/hooks/use-format";

import { getDealers } from "@/services/dealers";



export const Route = createFileRoute("/distributor/rewards")({

  component: DistributorRewardsPage,

});



function DistributorRewardsPage() {

  const { t } = useTranslation();

  const { formatNumber } = useFormat();

  const { data, loading, error, retry } = useAsyncData(() => getDealers(false, { sort: "name" }), []);



  const dealers = useMemo(() => {

    if (!data) return [];

    return [...data].sort((a, b) => b.rewardPoints - a.rewardPoints);

  }, [data]);



  return (

    <DistributorShell title={t("distributor.rewards.title")}>

      <p className="mb-4 text-sm text-muted-foreground">{t("distributor.rewards.description")}</p>



      {loading && <PageSkeleton rows={4} />}

      {error && <ErrorState message={error} onRetry={retry} />}



      {!loading && !error && dealers.length === 0 && (

        <EmptyState

          title={t("distributor.rewards.noDealers")}

          description={t("distributor.rewards.noDealersDesc")}

        />

      )}



      {!loading && !error && dealers.length > 0 && (

        <div className="space-y-3">

          {dealers.map((dealer) => (

            <Link

              key={dealer.id}

              to="/distributor/dealers/$dealerId"

              params={{ dealerId: dealer.id }}

              search={{ tab: "rewards" }}

              className="press flex items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-soft"

            >

              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-secondary">

                <Gift className="h-5 w-5 text-primary" />

              </span>

              <div className="min-w-0 flex-1">

                <p className="truncate font-display font-bold">{dealer.name}</p>

                <p className="text-xs text-muted-foreground">

                  {dealer.code} · {dealer.location}

                </p>

              </div>

              <p className="font-display text-lg font-bold text-primary">

                {formatNumber(dealer.rewardPoints)}

              </p>

            </Link>

          ))}

        </div>

      )}

    </DistributorShell>

  );

}


