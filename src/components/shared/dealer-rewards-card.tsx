import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { CountUp, ProgressBar } from "@/components/brand";
import type { DealerRewardsSummary } from "@/lib/dealer-rewards-summary";
import { cn } from "@/lib/utils";

type DealerRewardsCardProps = {
  summary: DealerRewardsSummary;
  className?: string;
  showFooter?: boolean;
};

export function DealerRewardsCard({ summary, className, showFooter = true }: DealerRewardsCardProps) {
  const { balance, nextReward, remaining, pct } = summary;

  return (
    <Link
      to="/rewards"
      className={cn(
        "press block overflow-hidden rounded-3xl border border-border surface-gradient p-5 shadow-lift",
        className,
      )}
    >
      <p className="text-sm font-semibold text-muted-foreground">Your reward points</p>
      <p className="mt-1 font-display text-5xl font-bold">
        <CountUp value={balance} />
        <span className="ml-2 text-lg font-semibold text-muted-foreground">Points</span>
      </p>
      <ProgressBar value={pct} className="mt-4" />
      <p className="mt-3 text-sm">
        {nextReward ? (
          remaining > 0 ? (
            <>
              <span className="font-bold">{remaining.toLocaleString("en-IN")} points</span> away from{" "}
              {nextReward.name} {nextReward.emoji}
            </>
          ) : (
            <>
              <span className="font-bold">Ready to redeem</span> — {nextReward.name} {nextReward.emoji}
            </>
          )
        ) : (
          <span className="text-muted-foreground">Start ordering to earn reward points</span>
        )}
      </p>
      {showFooter && nextReward && (
        <div className="mt-4 flex items-center justify-between rounded-2xl bg-card/70 px-4 py-3">
          <span className="text-sm font-semibold">
            Next reward: {nextReward.name} {nextReward.emoji}
          </span>
          <span className="flex items-center gap-1 text-sm font-bold text-primary">
            View Rewards <ChevronRight className="h-4 w-4" />
          </span>
        </div>
      )}
    </Link>
  );
}
