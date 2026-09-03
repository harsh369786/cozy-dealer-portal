import { id, nowIso } from "../utils";
import { hasRewardKindColumn, milestoneCatalogSqlFilter } from "../db/reward-schema";
import { coerceRewardPoints } from "./reward-points";

export async function getDealerLifetimeEarned(db: D1Database, dealerId: string): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(delta), 0) AS earned FROM points_ledger WHERE dealer_id = ? AND delta > 0`,
    )
    .bind(dealerId)
    .first<{ earned: number | string }>();
  return coerceRewardPoints(row?.earned, 0);
}

export async function listAdditionalRewardsForDealer(db: D1Database, dealerId: string) {
  const hasKind = await hasRewardKindColumn(db);
  const lifetimeEarned = await getDealerLifetimeEarned(db, dealerId);
  const kindFilter = milestoneCatalogSqlFilter(hasKind);

  const { results } = await db
    .prepare(
      `SELECT * FROM reward_catalog
       WHERE deleted_at IS NULL AND active = 1 ${kindFilter}
       ORDER BY points_required ASC`,
    )
    .all<Record<string, unknown>>();

  const claimedRow = hasKind
    ? await db
        .prepare(
          `SELECT rc.id, rc.name, rc.emoji, rc.reward_catalog_id
           FROM reward_claims rc
           JOIN reward_catalog cat ON cat.id = rc.reward_catalog_id
           WHERE rc.dealer_id = ?
             AND COALESCE(cat.kind, 'standard') = 'milestone'
           ORDER BY rc.claimed_at DESC
           LIMIT 1`,
        )
        .bind(dealerId)
        .first<{ id: string; name: string; emoji: string; reward_catalog_id: string }>()
    : null;

  const items = results.map((r) => {
    const points = coerceRewardPoints(r["points_required"], 0);
    const remaining = Math.max(0, points - lifetimeEarned);
    const pct = points <= 0 ? 100 : Math.min(100, Math.round((lifetimeEarned / points) * 100));
    return {
      id: String(r["id"] ?? ""),
      name: String(r["name"] ?? ""),
      emoji: String(r["emoji"] ?? ""),
      points,
      imageUrl: (r["image_url"] as string) ?? undefined,
      eligible: !claimedRow && remaining === 0,
      remaining,
      pct,
    };
  });

  return {
    lifetimeEarned,
    claimed: claimedRow
      ? { id: claimedRow.reward_catalog_id, name: claimedRow.name, emoji: claimedRow.emoji }
      : null,
    items,
  };
}

export async function redeemAdditionalReward(
  db: D1Database,
  dealerId: string,
  reward: { id: string; name: string; emoji: string; points_required: number },
) {
  const hasKind = await hasRewardKindColumn(db);
  if (!hasKind) throw new Error("Additional rewards are not available");

  const existing = await db
    .prepare(
      `SELECT rc.id FROM reward_claims rc
       JOIN reward_catalog cat ON cat.id = rc.reward_catalog_id
       WHERE rc.dealer_id = ? AND COALESCE(cat.kind, 'standard') = 'milestone'
       LIMIT 1`,
    )
    .bind(dealerId)
    .first();
  if (existing) throw new Error("You already chose an additional reward");

  const lifetime = await getDealerLifetimeEarned(db, dealerId);
  const required = Math.max(0, Math.round(Number(reward.points_required) || 0));
  if (lifetime < required) throw new Error("Not enough lifetime points");

  const claimId = id("rc");
  const claimedAt = nowIso();
  await db
    .prepare(
      `INSERT INTO reward_claims
         (id, dealer_id, reward_catalog_id, name, emoji, points_spent, status, claimed_at)
       VALUES (?, ?, ?, ?, ?, 0, 'pending', ?)`,
    )
    .bind(claimId, dealerId, reward.id, reward.name, reward.emoji, claimedAt)
    .run();

  return { claimId, claimedAt };
}
