import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Gift } from "lucide-react";
import { DistributorShell } from "@/components/distributor-shell";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/shared/states";
import { useAsyncData } from "@/hooks/use-async-data";
import { useFormat } from "@/hooks/use-format";
import { cn } from "@/lib/utils";
import { useRewardClaimStatusLabel, REWARD_CLAIM_STATUS_STYLES } from "@/lib/i18n-labels";
import { normalizeRewardClaimStatus } from "../../../../shared/reward-claim-status";
import { listRewardClaims, type RewardClaimListItem } from "@/services/reward-claims";

export const Route = createFileRoute("/distributor/reward-claims/")({
  component: DistributorRewardClaimsPage,
});

const TABS = [
  "all",
  "pending_approval",
  "approved",
  "dispatched_from_factory",
  "delivered",
  "rejected",
] as const;

function DistributorRewardClaimsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [status, setStatus] = useState<(typeof TABS)[number]>("all");

  const { data, loading, error, retry } = useAsyncData(
    () => listRewardClaims({ status: status === "all" ? "all" : status, pageSize: 50 }),
    [status],
  );

  const items = data?.items ?? [];

  return (
    <DistributorShell title={t("distributor.rewardClaims.title")}>
      <p className="mb-4 text-sm text-muted-foreground">{t("distributor.rewardClaims.description")}</p>

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setStatus(tab)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm font-bold transition-colors",
              status === tab
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-foreground hover:bg-secondary",
            )}
          >
            {tab === "all" ? t("common.all") : <TabLabel status={tab} />}
          </button>
        ))}
      </div>

      {loading && !data && <PageSkeleton rows={4} />}
      {error && !data && <ErrorState message={error} onRetry={retry} />}

      {data && items.length === 0 && (
        <EmptyState
          title={t("distributor.rewardClaims.empty")}
          description={t("distributor.rewardClaims.emptyDesc")}
        />
      )}

      {data && items.length > 0 && (
        <div className="space-y-3">
          {items.map((claim) => (
            <ClaimRow
              key={claim.id}
              claim={claim}
              onClick={() =>
                navigate({ to: "/distributor/reward-claims/$claimId", params: { claimId: claim.id } })
              }
            />
          ))}
        </div>
      )}
    </DistributorShell>
  );
}

function TabLabel({ status }: { status: string }) {
  return <>{useRewardClaimStatusLabel(status)}</>;
}

function ClaimRow({ claim, onClick }: { claim: RewardClaimListItem; onClick: () => void }) {
  const { formatNumber } = useFormat();
  const status = normalizeRewardClaimStatus(claim.status);
  const label = useRewardClaimStatusLabel(status);
  return (
    <button
      type="button"
      onClick={onClick}
      className="press flex w-full items-center gap-4 rounded-xl border border-border bg-card p-4 text-left shadow-soft"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-secondary text-xl">
        {claim.emoji || <Gift className="h-5 w-5 text-primary" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-display font-bold">{claim.rewardName}</p>
        <p className="truncate text-xs text-muted-foreground">{claim.dealerName}</p>
      </div>
      <div className="shrink-0 text-right">
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide",
            REWARD_CLAIM_STATUS_STYLES[status],
          )}
        >
          {label}
        </span>
        {claim.points > 0 && (
          <p className="mt-1 text-xs font-bold text-primary">{formatNumber(claim.points)}</p>
        )}
      </div>
    </button>
  );
}
