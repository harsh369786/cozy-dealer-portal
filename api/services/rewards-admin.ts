import { id, nowIso } from "../utils";
import { normalizeStoredImageUrl } from "./image-data-url";
import { writeAuditLog } from "./audit";

export type RewardCatalogRow = {
  id: string;
  name: string;
  emoji: string;
  pointsRequired: number;
  active: boolean;
  imageUrl?: string;
  description?: string;
};

export type RewardClaimRow = {
  id: string;
  dealerId: string;
  dealerName: string;
  rewardCatalogId: string | null;
  rewardName: string;
  emoji: string;
  points: number;
  status: "pending" | "delivered";
  claimedAt: string;
  deliveredAt: string | null;
};

function mapCatalog(row: Record<string, unknown>): RewardCatalogRow {
  return {
    id: row.id as string,
    name: row.name as string,
    emoji: row.emoji as string,
    pointsRequired: Number(row.points_required),
    active: Boolean(row.active),
    imageUrl: (row.image_url as string) ?? undefined,
  };
}

function mapClaim(row: Record<string, unknown>): RewardClaimRow {
  return {
    id: row.id as string,
    dealerId: row.dealer_id as string,
    dealerName: (row.dealer_name as string) ?? "Dealer",
    rewardCatalogId: (row.reward_catalog_id as string) ?? null,
    rewardName: row.name as string,
    emoji: row.emoji as string,
    points: Number(row.points_spent),
    status: row.status as "pending" | "delivered",
    claimedAt: row.claimed_at as string,
    deliveredAt: (row.delivered_at as string) ?? null,
  };
}

export async function listRewardCatalogAdmin(db: D1Database) {
  const { results } = await db
    .prepare(`SELECT * FROM reward_catalog WHERE deleted_at IS NULL ORDER BY points_required ASC`)
    .all();
  return results.map(mapCatalog);
}

export async function getRewardCatalogItem(db: D1Database, rewardId: string) {
  const row = await db
    .prepare(`SELECT * FROM reward_catalog WHERE id = ? AND deleted_at IS NULL`)
    .bind(rewardId)
    .first();
  return row ? mapCatalog(row) : null;
}

export async function saveRewardCatalogItem(
  db: D1Database,
  input: {
    id?: string;
    name: string;
    emoji: string;
    pointsRequired: number;
    active?: boolean;
    imageUrl?: string | null;
  },
  actorId: string,
) {
  const imageUrl = normalizeStoredImageUrl(input.imageUrl);
  const rewardId = input.id ?? id("rw");
  const existing = input.id
    ? await db.prepare(`SELECT id FROM reward_catalog WHERE id = ?`).bind(input.id).first()
    : null;

  if (existing) {
    await db
      .prepare(
        `UPDATE reward_catalog SET name = ?, emoji = ?, points_required = ?, active = ?, image_r2_key = ?, image_url = ? WHERE id = ?`,
      )
      .bind(
        input.name,
        input.emoji,
        input.pointsRequired,
        input.active === false ? 0 : 1,
        null,
        imageUrl,
        rewardId,
      )
      .run();
    await writeAuditLog(db, {
      actorUserId: actorId,
      action: "reward_catalog.update",
      entityType: "reward",
      entityId: rewardId,
      after: { name: input.name, pointsRequired: input.pointsRequired, active: input.active !== false },
    });
  } else {
    await db
      .prepare(
        `INSERT INTO reward_catalog (id, name, emoji, points_required, active, image_r2_key, image_url) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        rewardId,
        input.name,
        input.emoji,
        input.pointsRequired,
        input.active === false ? 0 : 1,
        null,
        imageUrl,
      )
      .run();
    await writeAuditLog(db, {
      actorUserId: actorId,
      action: "reward_catalog.create",
      entityType: "reward",
      entityId: rewardId,
      after: { name: input.name, pointsRequired: input.pointsRequired },
    });
  }

  return getRewardCatalogItem(db, rewardId);
}

export async function archiveRewardCatalogItem(db: D1Database, rewardId: string, actorId: string) {
  const existing = await getRewardCatalogItem(db, rewardId);
  await db
    .prepare(`UPDATE reward_catalog SET deleted_at = ?, active = 0 WHERE id = ?`)
    .bind(nowIso(), rewardId)
    .run();
  await writeAuditLog(db, {
    actorUserId: actorId,
    action: "reward_catalog.archive",
    entityType: "reward",
    entityId: rewardId,
    before: existing,
  });
}

export async function listRewardClaimsAdmin(
  db: D1Database,
  opts: { status?: string; search?: string; page?: number; pageSize?: number } = {},
) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, opts.pageSize ?? 10));
  const binds: unknown[] = [];
  let where = "WHERE 1=1";
  if (opts.status && opts.status !== "all") {
    where += " AND c.status = ?";
    binds.push(opts.status);
  }
  if (opts.search?.trim()) {
    where += " AND (d.store_name LIKE ? OR c.name LIKE ? OR c.id LIKE ?)";
    const q = `%${opts.search.trim()}%`;
    binds.push(q, q, q);
  }

  const countRow = await db
    .prepare(
      `SELECT COUNT(*) as c FROM reward_claims c
       JOIN dealers d ON d.id = c.dealer_id
       ${where}`,
    )
    .bind(...binds)
    .first<{ c: number }>();
  const total = countRow?.c ?? 0;
  const offset = (page - 1) * pageSize;

  const { results } = await db
    .prepare(
      `SELECT c.*, d.store_name as dealer_name FROM reward_claims c
       JOIN dealers d ON d.id = c.dealer_id
       ${where}
       ORDER BY c.claimed_at DESC LIMIT ? OFFSET ?`,
    )
    .bind(...binds, pageSize, offset)
    .all();

  return {
    items: results.map(mapClaim),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function updateRewardClaimStatus(
  db: D1Database,
  claimId: string,
  status: "pending" | "delivered",
  actorId: string,
) {
  const claim = await db
    .prepare(`SELECT * FROM reward_claims WHERE id = ?`)
    .bind(claimId)
    .first<Record<string, unknown>>();
  if (!claim) throw new Error("Claim not found");

  const deliveredAt = status === "delivered" ? nowIso() : null;
  await db
    .prepare(`UPDATE reward_claims SET status = ?, delivered_at = ? WHERE id = ?`)
    .bind(status, deliveredAt, claimId)
    .run();

  await writeAuditLog(db, {
    actorUserId: actorId,
    action: "reward_claim.update_status",
    entityType: "reward_claim",
    entityId: claimId,
    after: { status },
  });

  const row = await db
    .prepare(
      `SELECT c.*, d.store_name as dealer_name FROM reward_claims c
       JOIN dealers d ON d.id = c.dealer_id WHERE c.id = ?`,
    )
    .bind(claimId)
    .first();
  return row ? mapClaim(row) : null;
}

export async function undoRewardClaim(db: D1Database, claimId: string, actorId: string) {
  const claim = await db
    .prepare(`SELECT * FROM reward_claims WHERE id = ?`)
    .bind(claimId)
    .first<Record<string, unknown>>();
  if (!claim) throw new Error("Claim not found");

  const dealerId = claim.dealer_id as string;
  const points = Number(claim.points_spent);

  const last = await db
    .prepare(`SELECT balance_after FROM points_ledger WHERE dealer_id = ? ORDER BY occurred_at DESC LIMIT 1`)
    .bind(dealerId)
    .first<{ balance_after: number }>();
  const balance = (last?.balance_after ?? 0) + points;

  await db
    .prepare(
      `INSERT INTO points_ledger (id, dealer_id, delta, balance_after, label, reference_type, reference_id, occurred_at)
       VALUES (?, ?, ?, ?, ?, 'reward_claim_undo', ?, ?)`,
    )
    .bind(id("pl"), dealerId, points, balance, `Claim reversed: ${claim.name}`, claimId, nowIso())
    .run();

  await db.prepare(`DELETE FROM reward_claims WHERE id = ?`).bind(claimId).run();

  await writeAuditLog(db, {
    actorUserId: actorId,
    action: "reward_claim.undo",
    entityType: "reward_claim",
    entityId: claimId,
    before: { pointsReturned: points },
  });

  return { ok: true, pointsReturned: points };
}
