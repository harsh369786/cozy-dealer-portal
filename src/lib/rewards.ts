export type RewardCatalogItem = {
  id: string;
  name: string;
  emoji: string;
  points: number;
  imageUrl?: string;
};

/** Keep in sync with api/services/reward-points.ts */
export const MAX_REWARD_POINTS = 10_000_000;

export function normalizeRewardPoints(value: unknown, fallback = 0): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const rounded = Math.max(0, Math.round(n));
  return rounded > MAX_REWARD_POINTS ? fallback : rounded;
}

export function pickNextReward(
  balance: number,
  catalog: RewardCatalogItem[],
): RewardCatalogItem | null {
  if (!catalog.length) return null;
  const current = normalizeRewardPoints(balance);
  const sorted = [...catalog]
    .map((item) => ({ ...item, points: normalizeRewardPoints(item.points) }))
    .filter((item) => item.points > 0)
    .sort((a, b) => a.points - b.points);
  return sorted.find((r) => r.points > current) ?? sorted[sorted.length - 1] ?? null;
}

export function rewardProgress(balance: number, nextReward: RewardCatalogItem | null, fallbackTarget = 3000) {
  const current = normalizeRewardPoints(balance);
  const target = normalizeRewardPoints(nextReward?.points, normalizeRewardPoints(fallbackTarget, 3000));
  const remaining = Math.max(0, target - current);
  const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  return { target, remaining, pct };
}
