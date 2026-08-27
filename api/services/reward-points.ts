import { id, nowIso } from "../utils";

/** Sanity cap for dealer reward balances and catalog tiers (prevents corrupt ledger display). */
export const MAX_DEALER_REWARD_POINTS = 10_000_000;

export function coerceRewardPoints(value: unknown, fallback = 0): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const rounded = Math.max(0, Math.round(n));
  return rounded > MAX_DEALER_REWARD_POINTS ? fallback : rounded;
}

function coerceLedgerDelta(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return 0;
  const rounded = Math.round(n);
  if (Math.abs(rounded) > MAX_DEALER_REWARD_POINTS) return 0;
  return rounded;
}

/** Authoritative balance — sum ledger deltas (immune to bad balance_after rows). */
export async function getDealerPointsBalance(db: D1Database, dealerId: string): Promise<number> {
  const row = await db
    .prepare(`SELECT COALESCE(SUM(delta), 0) AS balance FROM points_ledger WHERE dealer_id = ?`)
    .bind(dealerId)
    .first<{ balance: number | string }>();
  return coerceRewardPoints(row?.balance, 0);
}

export async function getNextRewardThreshold(db: D1Database, balance: number): Promise<number> {
  const current = coerceRewardPoints(balance, 0);
  const nextAbove = await db
    .prepare(
      `SELECT points_required FROM reward_catalog
       WHERE active = 1 AND deleted_at IS NULL AND points_required > ?
       ORDER BY points_required ASC LIMIT 1`,
    )
    .bind(current)
    .first<{ points_required: number | string }>();
  const highest = await db
    .prepare(
      `SELECT points_required FROM reward_catalog
       WHERE active = 1 AND deleted_at IS NULL
       ORDER BY points_required DESC LIMIT 1`,
    )
    .first<{ points_required: number | string }>();
  return coerceRewardPoints(nextAbove?.points_required ?? highest?.points_required, 3000);
}

export async function appendPointsLedgerEntry(
  db: D1Database,
  input: {
    dealerId: string;
    delta: number;
    label: string;
    referenceType?: string | null;
    referenceId?: string | null;
    occurredAt?: string;
  },
) {
  const delta = coerceLedgerDelta(input.delta);
  if (delta === 0) return;

  const current = await getDealerPointsBalance(db, input.dealerId);
  const balanceAfter = Math.max(0, current + delta);

  await db
    .prepare(
      `INSERT INTO points_ledger (id, dealer_id, delta, balance_after, label, reference_type, reference_id, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id("pl"),
      input.dealerId,
      delta,
      balanceAfter,
      input.label,
      input.referenceType ?? null,
      input.referenceId ?? null,
      input.occurredAt ?? nowIso(),
    )
    .run();
}
