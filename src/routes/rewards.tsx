import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Gift } from "lucide-react";
import { AppShell, Section } from "@/components/app-shell";
import { Confetti, CountUp, ProgressBar, ProgressRing } from "@/components/brand";
import { cn } from "@/lib/utils";
import { requireRoles } from "@/lib/auth-guard";
import { resolveAssetUrl } from "@/lib/asset-url";
import { ConfirmActionDialog } from "@/components/shared/dialogs";
import { AdditionalRewardsSection } from "@/components/shared/additional-rewards-section";
import { PageSkeleton } from "@/components/shared/states";
import { normalizeRewardPoints } from "@/lib/rewards";
import { useDealerRewards } from "@/hooks/use-dealer-rewards";
import { useFormat } from "@/hooks/use-format";
import { useFormatApiError } from "@/lib/api-errors";
import {
  getRewardClaims,
  getRewardLedger,
  redeemReward,
  type DealerRewardClaim,
} from "@/services/rewards";
import { useRewardClaimStatusLabel, REWARD_CLAIM_STATUS_STYLES } from "@/lib/i18n-labels";
import { normalizeRewardClaimStatus } from "../../shared/reward-claim-status";
import i18n from "@/lib/i18n";

export const Route = createFileRoute("/rewards")({
  beforeLoad: () => requireRoles(["dealer"]),
  head: () => ({
    meta: [
      { title: i18n.t("dealer.meta.rewardsTitle") },
      {
        name: "description",
        content: i18n.t("dealer.meta.rewardsDescription"),
      },
      { property: "og:title", content: i18n.t("dealer.meta.rewardsTitle") },
      {
        property: "og:description",
        content: i18n.t("dealer.meta.rewardsDescription"),
      },
    ],
  }),
  component: Rewards,
});

function Rewards() {
  const { t } = useTranslation();
  const { formatNumber } = useFormat();
  const formatApiError = useFormatApiError();
  // The rewards page renders reward images, so it needs the full (image-laden) catalog.
  const { summary, loading, refresh } = useDealerRewards({ light: false });
  const [celebrate, setCelebrate] = useState(false);
  const [celebrateReward, setCelebrateReward] = useState<{ name: string; emoji: string } | null>(null);
  const [confirmReward, setConfirmReward] = useState<{ id: string; name: string; emoji: string; points: number } | null>(null);
  const [claimLoading, setClaimLoading] = useState(false);
  const [historyTab, setHistoryTab] = useState<"active" | "completed">("active");
  const [rewardHistory, setRewardHistory] = useState<DealerRewardClaim[]>([]);
  const [pointsHistory, setPointsHistory] = useState<Array<{ label: string; value: number; date: string }>>([]);

  useEffect(() => {
    getRewardClaims().then(setRewardHistory).catch(() => undefined);
    getRewardLedger()
      .then((rows) =>
        setPointsHistory(
          rows.map((h) => ({
            ...h,
            value:
              h.value < 0
                ? -normalizeRewardPoints(Math.abs(h.value), 0)
                : normalizeRewardPoints(h.value, 0),
          })),
        ),
      )
      .catch(() => undefined);
  }, []);

  const balance = summary?.balance ?? 0;
  const nextReward = summary?.nextReward ?? null;
  const remaining = summary?.remaining ?? 0;
  const pct = summary?.pct ?? 0;
  const rewards = summary?.catalog ?? [];

  // "Active" = still moving through the workflow; "Completed" = delivered/rejected/cancelled.
  const activeRewards = useMemo(
    () =>
      rewardHistory.filter(
        (c) => c.status !== "delivered" && c.status !== "rejected" && c.status !== "cancelled",
      ),
    [rewardHistory],
  );
  const completedRewards = useMemo(
    () =>
      rewardHistory.filter(
        (c) => c.status === "delivered" || c.status === "rejected" || c.status === "cancelled",
      ),
    [rewardHistory],
  );
  const historyItems = historyTab === "active" ? activeRewards : completedRewards;

  if (loading && !summary) {
    return (
      <AppShell title={t("dealer.rewards.title")}>
        <PageSkeleton rows={5} />
      </AppShell>
    );
  }

  return (
    <AppShell title={t("dealer.rewards.title")}>
      <div className="relative overflow-hidden rounded-3xl border border-primary/30 surface-gradient py-6 shadow-lift">
        {celebrate && celebrateReward && (
          <>
            <Confetti />
            <div className="absolute inset-0 z-10 grid place-items-center bg-background/80 backdrop-blur-sm">
              <div className="animate-rise rounded-3xl border border-primary/40 bg-card px-8 py-6 text-center shadow-lift">
                <p className="text-5xl">{celebrateReward.emoji}</p>
                <p className="mt-3 font-display text-2xl font-bold">{t("common.rewardClaimed")}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("common.rewardOnItsWay", { name: celebrateReward.name })}
                </p>
              </div>
            </div>
          </>
        )}
        <div className="grid place-items-center">
          <ProgressRing value={pct} label={`${Math.round(pct)}%`} sub={t("common.toNextReward")} />
          <p className="font-display text-4xl font-bold">
            <CountUp value={balance} /> <span className="text-lg">{t("common.points")}</span>
          </p>
        </div>

        <div className="mx-5 mt-5 rounded-2xl border border-border bg-card/80 p-4">
          {nextReward ? (
            <>
              <div className="flex items-center gap-3">
                {nextReward.imageUrl ? (
                  <img
                    src={resolveAssetUrl(nextReward.imageUrl)}
                    alt={nextReward.name}
                    className="h-12 w-12 shrink-0 rounded-2xl object-cover"
                  />
                ) : (
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-2xl">
                    {nextReward.emoji}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold uppercase tracking-wide text-primary">
                    {t("common.nextReward")}
                  </p>
                  <p className="font-display text-base font-bold">{nextReward.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {remaining > 0
                      ? t("common.pointsToGo", { count: formatNumber(remaining) })
                      : t("common.readyToRedeem")}
                    {" · "}
                    {t("common.pointsRequired", { count: formatNumber(nextReward.points) })}
                  </p>
                </div>
                <Gift className="h-5 w-5 shrink-0 text-primary" />
              </div>
              <ProgressBar value={pct} className="mt-4 h-3" />
              <p className="mt-3 text-center text-sm font-semibold">
                {remaining > 0
                  ? t("common.pointsAwayFrom", {
                      count: formatNumber(remaining),
                      name: nextReward.name,
                      emoji: nextReward.emoji,
                    })
                  : t("common.unlockedNextReward")}
              </p>
            </>
          ) : (
            <p className="text-center text-sm text-muted-foreground">{t("common.noRewardsCatalogue")}</p>
          )}
        </div>
      </div>

      <div className="mt-5">
        <AdditionalRewardsSection />
      </div>

      <Section title={t("common.rewardsYouCanClaim")}>
        <div className="space-y-3">
          {rewards.length === 0 ? (
            <p className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
              {t("common.noRewardsAvailable")}
            </p>
          ) : (
            rewards.map((r) => {
            const can = balance >= r.points;
            const p = Math.min(100, (balance / r.points) * 100);
            return (
              <div key={r.id} className="rounded-3xl border border-border bg-card p-4 shadow-soft">
                <div className="flex items-center gap-3">
                  {r.imageUrl ? (
                    <img
                      src={resolveAssetUrl(r.imageUrl)}
                      alt={r.name}
                      className="h-14 w-14 shrink-0 rounded-2xl object-cover"
                    />
                  ) : (
                    <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-secondary text-2xl">
                      {r.emoji}
                    </span>
                  )}
                  <div className="flex-1">
                    <p className="text-base font-bold">{r.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatNumber(r.points)} {t("common.points")}
                    </p>
                  </div>
                  <button
                    disabled={!can}
                    onClick={() => setConfirmReward({ id: r.id, name: r.name, emoji: r.emoji, points: r.points })}
                    className={cn(
                      "press rounded-xl px-5 py-3 text-sm font-bold",
                      can
                        ? "brand-gradient text-primary-foreground"
                        : "bg-secondary text-muted-foreground",
                    )}
                  >
                    {can ? t("common.redeem") : t("common.locked")}
                  </button>
                </div>
                <ProgressBar value={p} className="mt-3 h-2" />
                <p className="mt-2 text-xs text-muted-foreground">
                  {can
                    ? t("common.readyToClaim")
                    : t("common.pointsToGo", { count: formatNumber(r.points - balance) })}
                </p>
              </div>
            );
          })
          )}
        </div>
      </Section>

      <Section title={t("common.pointsHistory")}>
        <div className="divide-y divide-border rounded-3xl border border-border bg-card">
          {pointsHistory.map((h) => (
            <div key={h.label + h.date} className="flex items-center justify-between px-4 py-4">
              <div>
                <p className="text-base font-semibold">{h.label}</p>
                <p className="text-xs text-muted-foreground">{h.date}</p>
              </div>
              <span
                className={cn(
                  "font-display text-lg font-bold",
                  h.value > 0 ? "text-success" : "text-muted-foreground",
                )}
              >
                {h.value > 0 ? "+" : ""}
                {formatNumber(h.value)}
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section title={t("common.rewardHistory")}>
        <div className="mb-3 flex gap-2 rounded-2xl bg-secondary p-1">
          {(["active", "completed"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setHistoryTab(tab)}
              className={cn(
                "press flex-1 rounded-xl py-2.5 text-sm font-bold capitalize",
                historyTab === tab ? "bg-card shadow-soft" : "text-muted-foreground",
              )}
            >
              {tab === "active" ? t("common.rewardsInProgress") : t("common.rewardsCompleted")}
            </button>
          ))}
        </div>

        {historyItems.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            {historyTab === "active" ? t("common.noRewardsInProgress") : t("common.noCompletedRewards")}
          </p>
        ) : (
          <div className="space-y-3">
            {historyItems.map((claim) => (
              <DealerClaimCard key={claim.id} claim={claim} />
            ))}
          </div>
        )}
      </Section>
      <ConfirmActionDialog
        open={!!confirmReward}
        onOpenChange={(open) => !open && setConfirmReward(null)}
        title={t("common.claimRewardTitle")}
        description={
          confirmReward
            ? t("common.claimRewardDescription", {
                emoji: confirmReward.emoji,
                name: confirmReward.name,
                points: formatNumber(confirmReward.points),
              })
            : ""
        }
        confirmLabel={t("common.yesClaimIt")}
        loading={claimLoading}
        onConfirm={async () => {
          if (!confirmReward) return;
          setClaimLoading(true);
          try {
            await redeemReward(confirmReward.id);
            setCelebrateReward({ name: confirmReward.name, emoji: confirmReward.emoji });
            setCelebrate(true);
            setConfirmReward(null);
            refresh();
            const claims = await getRewardClaims();
            setRewardHistory(claims);
            setTimeout(() => {
              setCelebrate(false);
              setCelebrateReward(null);
            }, 2800);
          } catch (err) {
            toast.error(formatApiError(err, "errors.couldNotRedeemReward"));
          } finally {
            setClaimLoading(false);
          }
        }}
      />
    </AppShell>
  );
}

function DealerClaimCard({ claim }: { claim: DealerRewardClaim }) {
  const { t } = useTranslation();
  const status = normalizeRewardClaimStatus(claim.status);
  const label = useRewardClaimStatusLabel(status);
  return (
    <div className="rounded-3xl border border-border bg-card p-4 shadow-soft">
      <div className="flex items-start gap-3">
        {claim.imageUrl ? (
          <img
            src={resolveAssetUrl(claim.imageUrl)}
            alt={claim.name}
            className="h-12 w-12 shrink-0 rounded-2xl object-cover"
          />
        ) : (
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-secondary text-xl">
            {claim.emoji}
          </span>
        )}
        <div className="flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-base font-bold">{claim.name}</p>
            <span
              className={cn(
                "inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide",
                REWARD_CLAIM_STATUS_STYLES[status],
              )}
            >
              {label}
            </span>
          </div>
          {claim.claimed && (
            <p className="mt-1 text-sm text-muted-foreground">
              {t("common.claimed")}: {claim.claimed}
            </p>
          )}
          {status === "rejected" && claim.rejectionReason && (
            <p className="mt-2 text-sm font-semibold text-destructive">
              {t("common.rejectionReason")}: {claim.rejectionReason}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
