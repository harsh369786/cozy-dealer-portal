import type { SessionUser } from "../types";
import { id, nowIso } from "../utils";
import { writeAuditLog } from "./audit";
import { getDealerPointsBalance, coerceRewardPoints, MAX_DEALER_REWARD_POINTS } from "./reward-points";
import { notifyDealerUsers, withNotificationI18n } from "./notification-events";

export type DealerBalanceSummary = {
  dealerId: string;
  dealerName: string;
  dealerCode: string;
  balance: number;
};

/** Load a single dealer's name/code + authoritative ledger balance (for the credit preview). */
export async function getDealerBalanceSummary(
  db: D1Database,
  dealerId: string,
): Promise<DealerBalanceSummary | null> {
  const dealer = await db
    .prepare(`SELECT id, store_name, code FROM dealers WHERE id = ? AND deleted_at IS NULL`)
    .bind(dealerId)
    .first<{ id: string; store_name: string; code: string }>();
  if (!dealer) return null;
  const balance = await getDealerPointsBalance(db, dealerId);
  return {
    dealerId: dealer.id,
    dealerName: dealer.store_name,
    dealerCode: dealer.code,
    balance,
  };
}

export type ManualCreditResult = {
  transactionId: string;
  dealerId: string;
  dealerName: string;
  pointsAdded: number;
  previousBalance: number;
  newBalance: number;
  reason: string;
  creditedAt: string;
};

/**
 * Manually credit reward points to a dealer's wallet (Master Admin only).
 *
 * - `reason` is mandatory (validated here AND at the route/UI); a credit cannot happen without it.
 * - Records a single points_ledger row with a UNIQUE transaction id (reference_type='manual_credit',
 *   reference_id=the transaction id) capturing dealer, delta, reason (in the label), previous/new
 *   balance and occurred_at. The ledger row is immutable — corrections are done via a reversal, not
 *   by editing/deleting this row.
 * - Writes an audit log (actor = the master admin, before/after balance) and notifies the dealer.
 */
export async function creditDealerPointsManual(
  db: D1Database,
  input: { dealerId: string; points: number; reason: string; actor: SessionUser; ip?: string | null },
): Promise<ManualCreditResult> {
  const points = coerceRewardPoints(input.points, 0);
  if (points <= 0) throw new Error("Enter a positive number of points");

  const reason = (input.reason ?? "").trim();
  if (!reason) throw new Error("A reason is required to add reward points");

  const summary = await getDealerBalanceSummary(db, input.dealerId);
  if (!summary) throw new Error("Dealer not found");

  const previousBalance = summary.balance;
  const newBalance = previousBalance + points;
  if (newBalance > MAX_DEALER_REWARD_POINTS) {
    throw new Error("This credit would exceed the maximum allowed reward balance");
  }

  const transactionId = id("mc"); // manual-credit transaction id (unique)
  const creditedAt = nowIso();

  // Direct insert (not appendPointsLedgerEntry) so we control the exact reference/label and can
  // fail loudly rather than silently no-op. The transaction id is unique so this never double-credits.
  await db
    .prepare(
      `INSERT INTO points_ledger (id, dealer_id, delta, balance_after, label, reference_type, reference_id, occurred_at)
       VALUES (?, ?, ?, ?, ?, 'manual_credit', ?, ?)`,
    )
    .bind(
      id("pl"),
      input.dealerId,
      points,
      newBalance,
      `Manual credit: ${reason}`,
      transactionId,
      creditedAt,
    )
    .run();

  await writeAuditLog(db, {
    actorUserId: input.actor.id,
    action: "points.manual_credit",
    entityType: "dealer",
    entityId: input.dealerId,
    before: { balance: previousBalance },
    after: {
      balance: newBalance,
      pointsAdded: points,
      reason,
      transactionId,
      dealerName: summary.dealerName,
    },
    ip: input.ip ?? null,
  });

  await notifyDealerUsers(db, input.dealerId, {
    category: "rewards",
    type: "points_credited",
    title: "Reward points added",
    body: `${points.toLocaleString("en-IN")} reward points were added to your wallet. New balance: ${newBalance.toLocaleString("en-IN")}.`,
    link: "/rewards",
    ...withNotificationI18n(
      "notifications.pointsCredited.title",
      "notifications.pointsCredited.body",
      { points, balance: newBalance, reason },
    ),
  });

  return {
    transactionId,
    dealerId: input.dealerId,
    dealerName: summary.dealerName,
    pointsAdded: points,
    previousBalance,
    newBalance,
    reason,
    creditedAt,
  };
}

/** The current reward year. Reward year is a calendar year here (configurable later if needed). */
export function currentRewardYear(now: Date = new Date()): number {
  return now.getUTCFullYear();
}

export type RewardResetStatus = {
  rewardYear: number;
  alreadyResetThisYear: boolean;
  lastReset?: {
    referenceId: string;
    resetAt: string;
    dealersAffected: number;
    pointsCleared: number;
  };
};

/** Whether the current reward year has already been reset (for the duplicate-reset guard + UI). */
export async function getRewardResetStatus(db: D1Database): Promise<RewardResetStatus> {
  const rewardYear = currentRewardYear();
  const row = await db
    .prepare(
      `SELECT reference_id, reset_at, dealers_affected, points_cleared
       FROM reward_year_resets WHERE reward_year = ? LIMIT 1`,
    )
    .bind(rewardYear)
    .first<{
      reference_id: string;
      reset_at: string;
      dealers_affected: number;
      points_cleared: number;
    }>();
  return {
    rewardYear,
    alreadyResetThisYear: Boolean(row),
    lastReset: row
      ? {
          referenceId: row.reference_id,
          resetAt: row.reset_at,
          dealersAffected: row.dealers_affected,
          pointsCleared: row.points_cleared,
        }
      : undefined,
  };
}

export const REWARD_RESET_CODE = "1410";

export type RewardResetResult = {
  referenceId: string;
  rewardYear: number;
  dealersAffected: number;
  pointsCleared: number;
  resetAt: string;
};

/**
 * Reset the available reward balance of EVERY dealer to zero for a new reward year (Master Admin only).
 *
 * - Requires the exact reset code "1410"; anything else throws before any write.
 * - Duplicate-reset guard: throws if the current reward year was already reset (the caller may pass
 *   `force` after re-confirming, but the UNIQUE index still prevents two records for one year, so a
 *   second reset for the same year is refused).
 * - ATOMIC: one db.batch inserts the reward_year_resets record AND one negative points_ledger row per
 *   dealer whose balance is currently > 0 (delta = -balance -> new balance 0). Either the whole batch
 *   commits or none of it does — no partial resets. The reset UNIQUE index on reward_year makes the
 *   record insert the concurrency lock (a racing second reset fails the batch).
 * - History-preserving: it does NOT delete or modify any past ledger rows, claims, or redemptions. It
 *   only appends zeroing entries, establishing a fresh reward-year balance of 0.
 */
export async function resetAllDealerRewards(
  db: D1Database,
  input: { code: string; actor: SessionUser; ip?: string | null },
): Promise<RewardResetResult> {
  if ((input.code ?? "").trim() !== REWARD_RESET_CODE) {
    throw new Error("Incorrect reset code");
  }

  const rewardYear = currentRewardYear();
  const existing = await db
    .prepare(`SELECT id FROM reward_year_resets WHERE reward_year = ? LIMIT 1`)
    .bind(rewardYear)
    .first<{ id: string }>();
  if (existing) {
    throw new Error(`Rewards have already been reset for ${rewardYear}`);
  }

  const resetAt = nowIso();
  const referenceId = id("rr"); // reward-reset reference id (unique, stamped on each ledger row)

  // Every dealer with a positive available balance. Balance is SUM(delta); we zero it with a single
  // offsetting row per dealer. Dealers already at 0 (or negative, which shouldn't happen) are skipped.
  const { results } = await db
    .prepare(
      `SELECT dealer_id, COALESCE(SUM(delta), 0) AS balance
       FROM points_ledger
       GROUP BY dealer_id
       HAVING COALESCE(SUM(delta), 0) > 0`,
    )
    .all<{ dealer_id: string; balance: number | string }>();

  const dealers = results
    .map((r) => ({ dealerId: r.dealer_id, balance: coerceRewardPoints(r.balance, 0) }))
    .filter((r) => r.balance > 0);

  const dealersAffected = dealers.length;
  const pointsCleared = dealers.reduce((sum, d) => sum + d.balance, 0);

  const statements = [
    db
      .prepare(
        `INSERT INTO reward_year_resets (id, reward_year, reference_id, actor_user_id, dealers_affected, points_cleared, reset_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id("rys"), rewardYear, referenceId, input.actor.id, dealersAffected, pointsCleared, resetAt),
    ...dealers.map((d) =>
      db
        .prepare(
          `INSERT INTO points_ledger (id, dealer_id, delta, balance_after, label, reference_type, reference_id, occurred_at)
           VALUES (?, ?, ?, 0, ?, 'reward_reset', ?, ?)`,
        )
        .bind(id("pl"), d.dealerId, -d.balance, `Reward year ${rewardYear} reset`, referenceId, resetAt),
    ),
  ];

  // Atomic: the reward_year_resets UNIQUE(reward_year) makes a concurrent duplicate reset fail the
  // whole batch, and every zeroing ledger row commits together with the record (or none do).
  await db.batch(statements);

  await writeAuditLog(db, {
    actorUserId: input.actor.id,
    action: "points.reward_year_reset",
    entityType: "reward_year_reset",
    entityId: referenceId,
    before: null,
    after: { rewardYear, dealersAffected, pointsCleared, referenceId },
    ip: input.ip ?? null,
  });

  return { referenceId, rewardYear, dealersAffected, pointsCleared, resetAt };
}
