import { id, nowIso } from "../utils";

export async function redeemRewardClaim(
  db: D1Database,
  dealerId: string,
  reward: { id: string; name: string; emoji: string; points_required: number },
  distributorId?: string | null,
) {
  const claimId = id("rc");
  const claimedAt = nowIso();
  const pointsRequired = Math.max(0, Math.round(Number(reward.points_required) || 0));
  if (pointsRequired <= 0) throw new Error("Invalid reward");

  const [claimResult, ledgerResult] = await db.batch([
    db
      .prepare(
        // New claims enter the workflow at 'pending_approval' (awaiting distributor). The legacy
        // `status` column stays 'pending' for back-compat with older reads; workflow_status is the
        // authoritative lifecycle field. distributor_id is captured from the dealer at claim time.
        `INSERT INTO reward_claims
           (id, dealer_id, distributor_id, reward_catalog_id, name, emoji, points_spent, status, workflow_status, claimed_at, kind)
         SELECT ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending_approval', ?, 'standard'
         WHERE (
           SELECT COALESCE(SUM(delta), 0)
           FROM points_ledger
           WHERE dealer_id = ?
         ) >= ?`,
      )
      .bind(
        claimId,
        dealerId,
        distributorId ?? null,
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
        // The debit is guarded twice: (1) the paired claim row must exist, and (2) the balance
        // AFTER this debit must stay >= 0. Guard (2) makes concurrent redemptions safe — if two
        // requests both passed the claim-insert balance check against the same pre-debit balance,
        // whichever debit commits second sees the first debit already applied and its
        // (balance - pointsRequired) >= 0 check fails, so it inserts nothing (changes=0) and the
        // batch is rejected below. Prevents double-spend / negative balance without row locks.
        `INSERT INTO points_ledger
           (id, dealer_id, delta, balance_after, label, reference_type, reference_id, occurred_at)
         SELECT
           ?, ?, -?,
           (SELECT COALESCE(SUM(delta), 0) FROM points_ledger WHERE dealer_id = ?) - ?,
           ?, 'reward_claim', ?, ?
         WHERE EXISTS (
           SELECT 1 FROM reward_claims WHERE id = ? AND dealer_id = ?
         )
         AND (
           (SELECT COALESCE(SUM(delta), 0) FROM points_ledger WHERE dealer_id = ?) - ?
         ) >= 0`,
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
        dealerId,
        pointsRequired,
      ),
  ]);

  if ((claimResult.meta.changes ?? 0) !== 1 || (ledgerResult.meta.changes ?? 0) !== 1) {
    throw new Error("Insufficient points");
  }

  return { claimId, claimedAt };
}
