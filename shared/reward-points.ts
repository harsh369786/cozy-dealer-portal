/** Reward points earned per rupee of the percentage-based reward value. */
export const REWARD_POINTS_PER_RUPEE = 10;

/**
 * Reward Points = round((Dealer Price × Reward % / 100) × 10 × quantity)
 * Integer-safe: round(dealerPrice × percent / 10 × quantity).
 *
 * The rounding is applied ONCE to the whole-order total, not per-unit-then-multiplied. Rounding
 * each unit first and multiplying by qty compounds the per-unit rounding error (up to ~0.5pt × qty)
 * and diverges from round(total). Since points are money-equivalent here, this keeps large orders
 * accurate.
 */
export function calculateRewardPoints(
  dealerPrice: number,
  rewardPercent: number,
  quantity = 1,
): number {
  const dealer = Math.max(0, Math.round(Number(dealerPrice) || 0));
  const percent = Math.max(0, Number(rewardPercent) || 0);
  const qty = Math.max(1, Math.floor(Number(quantity) || 1));
  return Math.round((dealer * percent * qty) / 10);
}
