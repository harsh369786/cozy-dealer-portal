import {
  normalizeRewardPoints,
  pickNextReward,
  rewardProgress,
  type RewardCatalogItem,
} from "@/lib/rewards";
import { getRewardBalance, getRewardCatalog } from "@/services/rewards";

export type DealerRewardsSummary = {
  balance: number;
  nextRewardAt: number;
  catalog: RewardCatalogItem[];
  nextReward: RewardCatalogItem | null;
  target: number;
  remaining: number;
  pct: number;
};

export function computeDealerRewardsSummary(
  balance: number,
  nextRewardAt: number,
  catalog: RewardCatalogItem[],
  balanceOverride?: number,
): DealerRewardsSummary {
  const normalizedBalance = normalizeRewardPoints(balanceOverride ?? balance);
  const normalizedNextRewardAt = normalizeRewardPoints(nextRewardAt, 3000);
  const normalizedCatalog = catalog
    .map((item) => ({
      ...item,
      points: normalizeRewardPoints(item.points),
    }))
    .filter((item) => item.points > 0)
    .sort((a, b) => a.points - b.points);

  const nextReward = pickNextReward(normalizedBalance, normalizedCatalog);
  const { target, remaining, pct } = rewardProgress(
    normalizedBalance,
    nextReward,
    normalizedNextRewardAt,
  );

  return {
    balance: normalizedBalance,
    nextRewardAt: normalizedNextRewardAt,
    catalog: normalizedCatalog,
    nextReward,
    target,
    remaining,
    pct,
  };
}

export async function fetchDealerRewardsSummary(): Promise<DealerRewardsSummary> {
  const [balanceRes, catalogRes] = await Promise.all([getRewardBalance(), getRewardCatalog()]);
  return computeDealerRewardsSummary(
    balanceRes.balance,
    balanceRes.nextRewardAt,
    catalogRes.map((item) => ({
      id: item.id,
      name: item.name,
      emoji: item.emoji,
      points: item.points,
      imageUrl: item.imageUrl,
    })),
  );
}
