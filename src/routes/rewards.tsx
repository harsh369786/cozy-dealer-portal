import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell, Section } from "@/components/app-shell";
import { Confetti, CountUp, ProgressBar, ProgressRing } from "@/components/brand";
import { cn } from "@/lib/utils";
import { dealer, pointsHistory, rewardHistory, rewards } from "@/lib/demo-data";

export const Route = createFileRoute("/rewards")({
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
  const pct = Math.round((dealer.points / dealer.nextRewardAt) * 100);
  const remaining = dealer.nextRewardAt - dealer.points;

  return (
    <AppShell title="Your Rewards">
      <div className="relative grid place-items-center rounded-3xl border border-border surface-gradient py-6 shadow-lift">
        {celebrate && <Confetti />}
        <ProgressRing value={pct} label={`${pct}%`} sub="to next reward" />
        <p className="font-display text-4xl font-bold">
          <CountUp value={dealer.points} /> <span className="text-lg">Points</span>
        </p>
        <p className="mt-2 px-6 text-center text-base">
          <span className="font-bold">{remaining} points</span> to unlock your next reward 🎁
        </p>
      </div>

      <Section title="Rewards You Can Claim">
        <div className="space-y-3">
          {rewards.map((r) => {
            const can = dealer.points >= r.points;
            const p = Math.min(100, (dealer.points / r.points) * 100);
            return (
              <div key={r.id} className="rounded-3xl border border-border bg-card p-4 shadow-soft">
                <div className="flex items-center gap-3">
                  <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-secondary text-2xl">
                    {r.emoji}
                  </span>
                  <div className="flex-1">
                    <p className="text-base font-bold">{r.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {r.points.toLocaleString("en-IN")} Points
                    </p>
                  </div>
                  <button
                    disabled={!can}
                    onClick={() => {
                      setCelebrate(true);
                      toast.success(`${r.name} claimed! We'll ship it to your shop.`);
                      setTimeout(() => setCelebrate(false), 2200);
                    }}
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
          })}
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
        <div className="space-y-3">
          {rewardHistory.map((claim) => (
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
                      claim.status === "Delivered" ? "text-success" : "text-muted-foreground",
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
      </Section>
    </AppShell>
  );
}
