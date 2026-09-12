import type { SessionUser } from "../types";
import { nowIso } from "../utils";
import { writeAuditLog } from "./audit";
import {
  canTransitionRewardClaim,
  findRewardClaimTransition,
  normalizeRewardClaimStatus,
  REWARD_CLAIM_STATUS_LABELS,
  type RewardClaimStatus,
} from "../../shared/reward-claim-status";
import { appendUserDealerScopeSql } from "./scope";
import { notifyRewardClaimStatusChange } from "./notification-events";

/** Legacy `status` value kept loosely in sync with the workflow status for back-compat reads. */
function legacyStatusFor(workflow: RewardClaimStatus): "pending" | "approved" | "delivered" {
  if (workflow === "delivered") return "delivered";
  if (workflow === "approved" || workflow === "processing" || workflow === "dispatched_from_factory")
    return "approved";
  // pending_approval / rejected / cancelled -> 'pending' (rejected/cancelled have no legacy analog;
  // the workflow_status column carries the real state).
  return "pending";
}

/** Column that records the timestamp for a given workflow status (null when none). */
function timestampColumnFor(status: RewardClaimStatus): string | null {
  switch (status) {
    case "approved":
      return "approved_at";
    case "processing":
      return "processing_at";
    case "dispatched_from_factory":
      return "dispatched_at";
    case "delivered":
      return "delivered_at";
    case "rejected":
      return "rejected_at";
    case "cancelled":
      return "cancelled_at";
    default:
      return null;
  }
}

/** Column that records the actor for a given workflow status (null when none). */
function actorColumnFor(status: RewardClaimStatus): string | null {
  switch (status) {
    case "approved":
      return "approved_by";
    case "processing":
      return "processed_by";
    case "dispatched_from_factory":
      return "dispatched_by";
    case "delivered":
      return "delivered_by";
    case "rejected":
      return "rejected_by";
    default:
      return null;
  }
}

type ClaimRow = {
  id: string;
  dealer_id: string;
  distributor_id: string | null;
  name: string;
  workflow_status: string | null;
  status: string;
};

/**
 * Advance a reward claim to a new workflow status. Enforces:
 *  - the transition is legal for the actor's ROLE (shared transition table),
 *  - the distributor may only act on claims for THEIR dealers,
 *  - a rejection MUST carry a non-empty reason (persisted permanently),
 *  - stage timestamp + actor are recorded, and an audit log written.
 * Then fires the per-transition notifications (dealer + distributor + admins). Never touches Orders.
 */
export async function advanceRewardClaimStatus(
  db: D1Database,
  claimId: string,
  toStatus: RewardClaimStatus,
  actor: SessionUser,
  opts: { reason?: string } = {},
): Promise<{ ok: true; status: RewardClaimStatus }> {
  const claim = await db
    .prepare(
      `SELECT id, dealer_id, distributor_id, name, workflow_status, status FROM reward_claims WHERE id = ?`,
    )
    .bind(claimId)
    .first<ClaimRow>();
  if (!claim) throw new Error("Claim not found");

  const from = normalizeRewardClaimStatus(claim.workflow_status ?? claim.status);

  // Role must be permitted to make this exact transition.
  const transition = findRewardClaimTransition(from, toStatus);
  if (!transition) throw new Error(`Cannot move a claim from ${from} to ${toStatus}`);
  if (!canTransitionRewardClaim(actor.role, from, toStatus)) {
    throw new Error("You are not allowed to perform this action");
  }

  // A distributor / sales exec may only act within their own dealer scope.
  if (actor.role === "distributor" || actor.role === "sales_executive") {
    const scopeBinds: unknown[] = [];
    const scopeSql = appendUserDealerScopeSql(actor, "dealer_id", scopeBinds);
    const inScope = await db
      .prepare(`SELECT 1 AS ok FROM reward_claims WHERE id = ?${scopeSql}`)
      .bind(claimId, ...scopeBinds)
      .first<{ ok: number }>();
    if (!inScope) throw new Error("This claim is not in your network");
  }

  // Mandatory rejection reason.
  const reason = (opts.reason ?? "").trim();
  if (transition.requiresReason && !reason) {
    throw new Error("A rejection reason is required");
  }

  const ts = nowIso();
  const legacy = legacyStatusFor(toStatus);
  const tsCol = timestampColumnFor(toStatus);
  const actorCol = actorColumnFor(toStatus);

  // Build the UPDATE dynamically but with a fixed, whitelisted set of columns (no injection: the
  // column names come from our own switch, values are bound).
  const sets = ["workflow_status = ?", "status = ?"];
  const binds: unknown[] = [toStatus, legacy];
  if (tsCol) {
    sets.push(`${tsCol} = ?`);
    binds.push(ts);
  }
  if (actorCol) {
    sets.push(`${actorCol} = ?`);
    binds.push(actor.id);
  }
  if (toStatus === "rejected") {
    sets.push("rejection_reason = ?");
    binds.push(reason);
  }
  binds.push(claimId, claim.workflow_status ?? claim.status ?? from);

  // Guard on the current status so a concurrent double-action can't double-apply.
  const result = await db
    .prepare(
      `UPDATE reward_claims SET ${sets.join(", ")}
       WHERE id = ? AND COALESCE(workflow_status, status) = ?`,
    )
    .bind(...binds)
    .run();
  if ((result.meta.changes ?? 0) !== 1) {
    throw new Error("Claim was already updated; please refresh");
  }

  await writeAuditLog(db, {
    actorUserId: actor.id,
    action: `reward_claim.${toStatus}`,
    entityType: "reward_claim",
    entityId: claimId,
    before: { workflow_status: from },
    after: { workflow_status: toStatus, ...(reason ? { rejection_reason: reason } : {}) },
  });

  await notifyRewardClaimStatusChange(db, {
    claimId,
    dealerId: claim.dealer_id,
    distributorId: claim.distributor_id,
    rewardName: claim.name,
    toStatus,
    statusLabel: REWARD_CLAIM_STATUS_LABELS[toStatus],
    reason: toStatus === "rejected" ? reason : undefined,
    actorUserId: actor.id,
  });

  return { ok: true, status: toStatus };
}

/** Full detail for one claim, including a chronological history built from stage timestamps. */
export async function getRewardClaimDetail(db: D1Database, claimId: string) {
  const row = await db
    .prepare(
      `SELECT c.*, d.store_name AS dealer_name, d.code AS dealer_code,
              dist.name AS distributor_name,
              ua.name AS approved_by_name,
              up.name AS processed_by_name,
              udi.name AS dispatched_by_name,
              ude.name AS delivered_by_name,
              ur.name AS rejected_by_name
       FROM reward_claims c
       JOIN dealers d ON d.id = c.dealer_id
       LEFT JOIN distributors dist ON dist.id = c.distributor_id
       LEFT JOIN users ua ON ua.id = c.approved_by
       LEFT JOIN users up ON up.id = c.processed_by
       LEFT JOIN users udi ON udi.id = c.dispatched_by
       LEFT JOIN users ude ON ude.id = c.delivered_by
       LEFT JOIN users ur ON ur.id = c.rejected_by
       WHERE c.id = ?`,
    )
    .bind(claimId)
    .first<Record<string, unknown>>();
  if (!row) return null;
  return mapClaimDetail(row);
}

export type RewardClaimHistoryEntry = {
  status: RewardClaimStatus;
  at: string;
  by?: string;
  note?: string;
};

export function mapClaimDetail(row: Record<string, unknown>) {
  const workflow = normalizeRewardClaimStatus(row.workflow_status ?? row.status);
  const str = (v: unknown) => (v == null ? undefined : String(v));

  const history: RewardClaimHistoryEntry[] = [];
  const push = (status: RewardClaimStatus, at: unknown, by?: unknown, note?: unknown) => {
    if (at) history.push({ status, at: String(at), by: str(by), note: str(note) });
  };
  // Claimed / pending approval is always the first entry.
  push("pending_approval", row.claimed_at);
  push("approved", row.approved_at, row.approved_by_name);
  push("processing", row.processing_at, row.processed_by_name);
  push("dispatched_from_factory", row.dispatched_at, row.dispatched_by_name);
  push("delivered", row.delivered_at, row.delivered_by_name);
  push("rejected", row.rejected_at, row.rejected_by_name, row.rejection_reason);
  push("cancelled", row.cancelled_at);
  history.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

  return {
    id: row.id as string,
    dealerId: row.dealer_id as string,
    dealerName: (row.dealer_name as string) ?? "Dealer",
    dealerCode: str(row.dealer_code),
    distributorId: str(row.distributor_id),
    distributorName: str(row.distributor_name),
    rewardCatalogId: (row.reward_catalog_id as string) ?? null,
    rewardName: row.name as string,
    emoji: row.emoji as string,
    points: Number(row.points_spent ?? 0),
    kind: (row.kind as string) === "milestone" ? "milestone" : "standard",
    status: workflow,
    rejectionReason: str(row.rejection_reason),
    claimedAt: str(row.claimed_at),
    approvedAt: str(row.approved_at),
    processingAt: str(row.processing_at),
    dispatchedAt: str(row.dispatched_at),
    deliveredAt: str(row.delivered_at),
    rejectedAt: str(row.rejected_at),
    cancelledAt: str(row.cancelled_at),
    history,
  };
}

/** Map a claim list row (lighter than detail — no history). */
function mapClaimListRow(row: Record<string, unknown>) {
  const workflow = normalizeRewardClaimStatus(row.workflow_status ?? row.status);
  return {
    id: row.id as string,
    dealerId: row.dealer_id as string,
    dealerName: (row.dealer_name as string) ?? "Dealer",
    distributorId: (row.distributor_id as string) ?? undefined,
    distributorName: (row.distributor_name as string) ?? undefined,
    rewardName: row.name as string,
    emoji: row.emoji as string,
    // Image from the reward catalog (joined) so claim history can show the reward picture, not just
    // the emoji fallback. Null when the reward has no image or the catalog row is gone.
    imageUrl: (row.reward_image_url as string) ?? null,
    points: Number(row.points_spent ?? 0),
    kind: (row.kind as string) === "milestone" ? "milestone" : "standard",
    status: workflow,
    rejectionReason: (row.rejection_reason as string) ?? undefined,
    claimedAt: (row.claimed_at as string) ?? undefined,
  };
}

/**
 * Role-scoped reward-claim list.
 *  - master_admin / admin_staff / sales_head / sales_executive(full? no—scoped): full-access roles
 *    see ALL claims; distributor sees claims for THEIR dealers; sales_executive sees their dealers'
 *    claims; dealer sees their own.
 * Filter by workflow status + search on dealer/reward/id. Paginated.
 */
export async function listRewardClaimsScoped(
  db: D1Database,
  user: SessionUser,
  opts: { status?: string; search?: string; page?: number; pageSize?: number } = {},
) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, opts.pageSize ?? 10));
  const binds: unknown[] = [];
  let where = "WHERE 1=1";

  // Dealer: only their own claims.
  if (user.role === "dealer") {
    if (!user.dealerId) return { items: [], total: 0, page, pageSize, totalPages: 1 };
    where += " AND c.dealer_id = ?";
    binds.push(user.dealerId);
  } else {
    // distributor / sales_executive get scoped; full-access roles get "" (all).
    where += appendUserDealerScopeSql(user, "c.dealer_id", binds);
  }

  if (opts.status && opts.status !== "all") {
    where += " AND COALESCE(c.workflow_status, c.status) = ?";
    binds.push(normalizeRewardClaimStatus(opts.status));
  }
  if (opts.search?.trim()) {
    where += " AND (d.store_name LIKE ? OR c.name LIKE ? OR c.id LIKE ?)";
    const q = `%${opts.search.trim()}%`;
    binds.push(q, q, q);
  }

  const countRow = await db
    .prepare(`SELECT COUNT(*) AS c FROM reward_claims c JOIN dealers d ON d.id = c.dealer_id ${where}`)
    .bind(...binds)
    .first<{ c: number }>();
  const total = countRow?.c ?? 0;
  const offset = (page - 1) * pageSize;

  const { results } = await db
    .prepare(
      `SELECT c.*, d.store_name AS dealer_name, dist.name AS distributor_name,
              rc.image_url AS reward_image_url
       FROM reward_claims c
       JOIN dealers d ON d.id = c.dealer_id
       LEFT JOIN distributors dist ON dist.id = c.distributor_id
       LEFT JOIN reward_catalog rc ON rc.id = c.reward_catalog_id
       ${where}
       ORDER BY c.claimed_at DESC LIMIT ? OFFSET ?`,
    )
    .bind(...binds, pageSize, offset)
    .all<Record<string, unknown>>();

  return {
    items: results.map(mapClaimListRow),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
