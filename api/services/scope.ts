import type { SessionUser } from "../types";

/**
 * Roles that see the entire operation (nationwide, no dealer/distributor restriction).
 * sales_head is a first-class effective role (migration 0034 / api/types.ts) — a view-only
 * head-of-sales who monitors the whole network — so it must get the SAME full read scope as
 * master_admin / admin_staff. It was previously omitted here, which silently scoped it to nothing
 * (the `AND 1=0` fallthrough), hiding all data from that role.
 */
function isFullAccessRole(role: SessionUser["role"]): boolean {
  return role === "master_admin" || role === "admin_staff" || role === "sales_head";
}

export async function getAssignedDealerIds(
  db: D1Database,
  user: SessionUser,
): Promise<string[] | "all"> {
  if (isFullAccessRole(user.role)) return "all";
  if (user.role === "dealer" && user.dealerId) return [user.dealerId];
  if (user.role === "distributor" && user.distributorId) {
    const { results } = await db
      .prepare(`SELECT id FROM dealers WHERE distributor_id = ? AND deleted_at IS NULL`)
      .bind(user.distributorId)
      .all<{ id: string }>();
    return results.map((r) => r.id);
  }
  if (user.role === "sales_executive") {
    const { results } = await db
      .prepare(`SELECT id FROM dealers WHERE sales_executive_user_id = ? AND deleted_at IS NULL`)
      .bind(user.id)
      .all<{ id: string }>();
    return results.map((r) => r.id);
  }
  return [];
}

/** Alias used by orders, complaints, and reports. */
export const getScopedDealerIds = getAssignedDealerIds;

export function appendUserDealerScopeSql(
  user: SessionUser,
  column: string,
  binds: unknown[],
): string {
  if (isFullAccessRole(user.role)) return "";
  if (user.role === "dealer") {
    if (!user.dealerId) return " AND 1=0";
    binds.push(user.dealerId);
    return ` AND ${column} = ?`;
  }
  if (user.role === "distributor" && user.distributorId) {
    binds.push(user.distributorId);
    return ` AND ${column} IN (SELECT id FROM dealers WHERE distributor_id = ? AND deleted_at IS NULL)`;
  }
  if (user.role === "sales_executive") {
    binds.push(user.id);
    return ` AND ${column} IN (SELECT id FROM dealers WHERE sales_executive_user_id = ? AND deleted_at IS NULL)`;
  }
  return " AND 1=0";
}

export function dealerIdsInClause(
  dealerIds: string[],
  column = "dealer_id",
): { sql: string; binds: string[] } {
  if (!dealerIds.length) return { sql: " AND 1=0", binds: [] };
  return {
    sql: ` AND ${column} IN (${dealerIds.map(() => "?").join(",")})`,
    binds: dealerIds,
  };
}

export function appendDealerScopeSql(
  dealerIds: string[] | "all" | "none",
  column: string,
  binds: unknown[],
): string {
  if (dealerIds === "all") return "";
  if (dealerIds === "none") return " AND 1=0";
  binds.push(...dealerIds);
  return ` AND ${column} IN (${dealerIds.map(() => "?").join(",")})`;
}

export type ReportScope =
  | { allowed: true; user: SessionUser }
  | { allowed: false };

export async function resolveReportScope(_db: D1Database, user: SessionUser): Promise<ReportScope> {
  if (user.role === "admin_staff") return { allowed: false };
  return { allowed: true, user };
}

export async function canAccessDealer(
  db: D1Database,
  user: SessionUser,
  dealerId: string,
): Promise<boolean> {
  if (isFullAccessRole(user.role)) return true;
  if (user.role === "dealer") return user.dealerId === dealerId;
  if (user.role === "distributor" && user.distributorId) {
    const row = await db
      .prepare(`SELECT id FROM dealers WHERE id = ? AND distributor_id = ? AND deleted_at IS NULL`)
      .bind(dealerId, user.distributorId)
      .first();
    return Boolean(row);
  }
  if (user.role === "sales_executive") {
    const row = await db
      .prepare(
        `SELECT id FROM dealers WHERE id = ? AND sales_executive_user_id = ? AND deleted_at IS NULL`,
      )
      .bind(dealerId, user.id)
      .first();
    return Boolean(row);
  }
  return false;
}

export async function canAccessOrder(
  db: D1Database,
  user: SessionUser,
  orderId: string,
): Promise<boolean> {
  const order = await db
    .prepare(`SELECT dealer_id, distributor_id FROM orders WHERE id = ? AND deleted_at IS NULL`)
    .bind(orderId)
    .first<{ dealer_id: string; distributor_id: string }>();
  if (!order) return false;
  if (isFullAccessRole(user.role)) return true;
  if (user.role === "dealer") return user.dealerId === order.dealer_id;
  if (user.role === "distributor" || user.role === "sales_executive") {
    return canAccessDealer(db, user, order.dealer_id);
  }
  return false;
}

export async function canAccessComplaint(
  db: D1Database,
  user: SessionUser,
  complaintId: string,
): Promise<boolean> {
  const complaint = await db
    .prepare(`SELECT dealer_id FROM complaints WHERE id = ? AND deleted_at IS NULL`)
    .bind(complaintId)
    .first<{ dealer_id: string }>();
  if (!complaint) return false;
  if (isFullAccessRole(user.role)) return true;
  if (user.role === "dealer") return user.dealerId === complaint.dealer_id;
  if (user.role === "distributor" || user.role === "sales_executive") {
    return canAccessDealer(db, user, complaint.dealer_id);
  }
  return false;
}
