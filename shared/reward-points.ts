/** Reward points earned per rupee of the percentage-based reward value. */
export const REWARD_POINTS_PER_RUPEE = 10;

/**
 * Reward Points = round((Dealer Price × Reward % / 100) × 10)
 * Integer-safe: round(dealerPrice × percent / 10).
 */
export function calculateRewardPoints(
  dealerPrice: number,
  rewardPercent: number,
  quantity = 1,
): number {
  const dealer = Math.max(0, Math.round(Number(dealerPrice) || 0));
  const percent = Math.max(0, Number(rewardPercent) || 0);
  const qty = Math.max(1, Math.floor(Number(quantity) || 1));
  const unitPoints = Math.round((dealer * percent) / 10);
  return unitPoints * qty;
}
