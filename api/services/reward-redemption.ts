import { id, nowIso } from "../utils";

export async function redeemRewardClaim(
  db: D1Database,
  dealerId: string,
  reward: { id: string; name: string; emoji: string; points_required: number },
) {
  const claimId = id("rc");
  const claimedAt = nowIso();
  const pointsRequired = Number(reward.points_required);

  const balanceSubquery = `COALESCE((
    SELECT balance_after FROM points_ledger
    WHERE dealer_id = ? ORDER BY occurred_at DESC, id DESC LIMIT 1
  ), 0)`;

  const ledgerInsert = db
    .prepare(
      `INSERT INTO points_ledger (id, dealer_id, delta, balance_after, label, reference_type, reference_id, occurred_at)
       SELECT ?, ?, ?, ${balanceSubquery} - ?, ?, 'reward_claim', ?, ?
       WHERE ${balanceSubquery} >= ?`,
    )
    .bind(
      id("pl"),
      dealerId,
      -pointsRequired,
      dealerId,
      pointsRequired,
      reward.name,
      claimId,
      claimedAt,
      dealerId,
      pointsRequired,
    );

  const claimInsert = db
    .prepare(
      `INSERT INTO reward_claims (id, dealer_id, reward_catalog_id, name, emoji, points_spent, status, claimed_at)
       SELECT ?, ?, ?, ?, ?, ?, 'pending', ?
       WHERE ${balanceSubquery} >= ?`,
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
    );

  const results = await db.batch([ledgerInsert, claimInsert]);
  if (!results[0].meta.changes || !results[1].meta.changes) {
    throw new Error("Insufficient points");
  }

  return { claimId, claimedAt };
}
