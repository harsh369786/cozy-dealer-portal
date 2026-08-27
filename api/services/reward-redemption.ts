import { id, nowIso } from "../utils";

export async function redeemRewardClaim(
  db: D1Database,
  dealerId: string,
  reward: { id: string; name: string; emoji: string; points_required: number },
) {
  const claimId = id("rc");
  const claimedAt = nowIso();
  const pointsRequired = Math.max(0, Math.round(Number(reward.points_required) || 0));
  if (pointsRequired <= 0) throw new Error("Invalid reward");

  const [claimResult, ledgerResult] = await db.batch([
    db
      .prepare(
        `INSERT INTO reward_claims
           (id, dealer_id, reward_catalog_id, name, emoji, points_spent, status, claimed_at)
         SELECT ?, ?, ?, ?, ?, ?, 'pending', ?
         WHERE (
           SELECT COALESCE(SUM(delta), 0)
           FROM points_ledger
           WHERE dealer_id = ?
         ) >= ?`,
      )
      .bind(
        claimId,
        dealerId,
        reward.id,
        reward.name,
        reward.emoji,
        pointsRequired,
        claimedAt,
        dealerId,
        pointsRequired,
      ),
    db
      .prepare(
        `INSERT INTO points_ledger
           (id, dealer_id, delta, balance_after, label, reference_type, reference_id, occurred_at)
         SELECT
           ?, ?, -?,
           (SELECT COALESCE(SUM(delta), 0) FROM points_ledger WHERE dealer_id = ?) - ?,
           ?, 'reward_claim', ?, ?
         WHERE EXISTS (
           SELECT 1 FROM reward_claims WHERE id = ? AND dealer_id = ?
         )`,
      )
      .bind(
        id("pl"),
        dealerId,
        pointsRequired,
        dealerId,
        pointsRequired,
        reward.name,
        claimId,
        claimedAt,
        claimId,
        dealerId,
      ),
  ]);

  if ((claimResult.meta.changes ?? 0) !== 1 || (ledgerResult.meta.changes ?? 0) !== 1) {
    throw new Error("Insufficient points");
  }

  return { claimId, claimedAt };
}
