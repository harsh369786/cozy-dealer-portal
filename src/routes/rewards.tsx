import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Gift } from "lucide-react";
import { AppShell, Section } from "@/components/app-shell";
import { Confetti, CountUp, ProgressBar, ProgressRing } from "@/components/brand";
import { cn } from "@/lib/utils";
import { requireRoles } from "@/lib/auth-guard";
import { resolveAssetUrl } from "@/lib/asset-url";
import { ConfirmActionDialog } from "@/components/shared/dialogs";
import {
  getRewardBalance,
  getRewardCatalog,
  getRewardClaims,
  getRewardLedger,
  redeemReward,
} from "@/services/rewards";

export const Route = createFileRoute("/rewards")({
  beforeLoad: () => requireRoles(["dealer"]),
  head: () => ({
    meta: [
      { title: "Rewards — BackRest Dealer App" },
      {
        name: "description",
        content: "Track your points, claim rewards and see your points history.",
      },
      { property: "og:title", content: "Rewards — BackRest Dealer App" },
      {
        property: "og:description",
        content: "Earn points on every order and redeem them for gifts.",
      },
    ],
  }),
  component: Rewards,
});

function Rewards() {
  const [celebrate, setCelebrate] = useState(false);
  const [celebrateReward, setCelebrateReward] = useState<{ name: string; emoji: string } | null>(null);
  const [confirmReward, setConfirmReward] = useState<{ id: string; name: string; emoji: string; points: number } | null>(null);
  const [claimLoading, setClaimLoading] = useState(false);
  const [historyTab, setHistoryTab] = useState<"pending" | "delivered">("pending");
  const [balance, setBalance] = useState({ balance: 0, nextRewardAt: 3000 });
  const [rewards, setRewards] = useState<Array<{ id: string; name: string; emoji: string; points: number; imageUrl?: string }>>([]);
  const [rewardHistory, setRewardHistory] = useState<
    Array<{ id: string; name: string; emoji: string; claimed: string; status: string; delivered?: string }>
  >([]);
  const [pointsHistory, setPointsHistory] = useState<Array<{ label: string; value: number; date: string }>>([]);

  useEffect(() => {
    getRewardBalance().then(setBalance).catch(() => undefined);
    getRewardClaims().then(setRewardHistory).catch(() => undefined);
    getRewardLedger().then(setPointsHistory).catch(() => undefined);
    getRewardCatalog().then(setRewards).catch(() => undefined);
  }, []);

  const dealer = { points: balance.balance, nextRewardAt: balance.nextRewardAt };
  const nextReward = rewards.find((r) => r.points > dealer.points) ?? rewards[0] ?? null;
  const pct = nextReward ? Math.min(100, Math.round((dealer.points / nextReward.points) * 100)) : 0;
  const remaining = nextReward ? Math.max(0, nextReward.points - dealer.points) : 0;

  const pendingRewards = useMemo(
    () => rewardHistory.filter((c) => c.status === "pending"),
    [rewardHistory],
  );
  const deliveredRewards = useMemo(
    () => rewardHistory.filter((c) => c.status === "delivered"),
    [rewardHistory],
  );
  const historyItems = historyTab === "pending" ? pendingRewards : deliveredRewards;

  return (
    <AppShell title="Your Rewards">
      <div className="relative overflow-hidden rounded-3xl border border-primary/30 surface-gradient py-6 shadow-lift">
        {celebrate && celebrateReward && (
          <>
            <Confetti />
            <div className="absolute inset-0 z-10 grid place-items-center bg-background/80 backdrop-blur-sm">
              <div className="animate-rise rounded-3xl border border-primary/40 bg-card px-8 py-6 text-center shadow-lift">
                <p className="text-5xl">{celebrateReward.emoji}</p>
                <p className="mt-3 font-display text-2xl font-bold">Reward claimed!</p>
                <p className="mt-1 text-sm text-muted-foreground">{celebrateReward.name} is on its way to your shop.</p>
              </div>
            </div>
          </>
        )}
        <div className="grid place-items-center">
          <ProgressRing value={pct} label={`${pct}%`} sub="to next reward" />
          <p className="font-display text-4xl font-bold">
            <CountUp value={dealer.points} /> <span className="text-lg">Points</span>
          </p>
        </div>

        <div className="mx-5 mt-5 rounded-2xl border border-border bg-card/80 p-4">
          {nextReward ? (
            <>
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-2xl">
                  {nextReward.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold uppercase tracking-wide text-primary">Next reward</p>
                  <p className="font-display text-base font-bold">{nextReward.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {nextReward.points.toLocaleString("en-IN")} points
                  </p>
                </div>
                <Gift className="h-5 w-5 shrink-0 text-primary" />
              </div>
              <ProgressBar value={pct} className="mt-4 h-3" />
              <p className="mt-3 text-center text-sm font-semibold">
                {remaining > 0 ? (
                  <>
                    <span className="font-display text-lg font-bold text-primary">{remaining}</span>{" "}
                    points to unlock your {nextReward.name} 🎁
                  </>
                ) : (
                  "You've unlocked your next reward — redeem it below!"
                )}
              </p>
            </>
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              Rewards catalogue is being updated. Check back soon.
            </p>
          )}
        </div>
      </div>

      <Section title="Rewards You Can Claim">
        <div className="space-y-3">
          {rewards.length === 0 ? (
            <p className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
              No rewards available right now.
            </p>
          ) : (
            rewards.map((r) => {
            const can = dealer.points >= r.points;
            const p = Math.min(100, (dealer.points / r.points) * 100);
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
                      {r.points.toLocaleString("en-IN")} Points
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
                    {can ? "Redeem" : "Locked"}
                  </button>
                </div>
                <ProgressBar value={p} className="mt-3 h-2" />
                <p className="mt-2 text-xs text-muted-foreground">
                  {can
                    ? "Ready to claim"
                    : `${(r.points - dealer.points).toLocaleString("en-IN")} points to go`}
                </p>
              </div>
            );
          })
          )}
        </div>
      </Section>

      <Section title="Points History">
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
                {h.value.toLocaleString("en-IN")}
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Reward History">
        <div className="mb-3 flex gap-2 rounded-2xl bg-secondary p-1">
          {(["pending", "delivered"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setHistoryTab(tab)}
              className={cn(
                "press flex-1 rounded-xl py-2.5 text-sm font-bold capitalize",
                historyTab === tab ? "bg-card shadow-soft" : "text-muted-foreground",
              )}
            >
              {tab === "pending" ? "Pending Rewards" : "Delivered Rewards"}
            </button>
          ))}
        </div>

        {historyItems.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            No {historyTab} rewards yet.
          </p>
        ) : (
          <div className="space-y-3">
            {historyItems.map((claim) => (
              <div
                key={claim.id}
                className="rounded-3xl border border-border bg-card p-4 shadow-soft"
              >
                <div className="flex items-start gap-3">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-secondary text-xl">
                    {claim.emoji}
                  </span>
                  <div className="flex-1">
                    <p className="text-base font-bold">{claim.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">Claimed: {claim.claimed}</p>
                    <p
                      className={cn(
                        "mt-2 text-sm font-bold",
                        claim.status === "Delivered" ? "text-success" : "text-amber-700",
                      )}
                    >
                      Status: {claim.status === "Delivered" ? "✅ Delivered" : "⏳ Pending"}
                    </p>
                    {claim.status === "Delivered" && claim.delivered && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        Delivery Date: {claim.delivered}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
      <ConfirmActionDialog
        open={!!confirmReward}
        onOpenChange={(open) => !open && setConfirmReward(null)}
        title="Claim this reward?"
        description={
          confirmReward
            ? `Are you sure you want to claim ${confirmReward.emoji} ${confirmReward.name} for ${confirmReward.points.toLocaleString("en-IN")} points?`
            : ""
        }
        confirmLabel="Yes, claim it"
        loading={claimLoading}
        onConfirm={async () => {
          if (!confirmReward) return;
          setClaimLoading(true);
          try {
            await redeemReward(confirmReward.id);
            setCelebrateReward({ name: confirmReward.name, emoji: confirmReward.emoji });
            setCelebrate(true);
            setConfirmReward(null);
            const [bal, claims] = await Promise.all([getRewardBalance(), getRewardClaims()]);
            setBalance(bal);
            setRewardHistory(claims);
            setTimeout(() => {
              setCelebrate(false);
              setCelebrateReward(null);
            }, 2800);
          } catch {
            toast.error("Could not redeem reward");
          } finally {
            setClaimLoading(false);
          }
        }}
      />
    </AppShell>
  );
}
