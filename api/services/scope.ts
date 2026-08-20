import type { SessionUser } from "../types";

export async function getAssignedDealerIds(
  db: D1Database,
  user: SessionUser,
): Promise<string[] | "all"> {
  if (user.role === "master_admin" || user.role === "admin_staff") return "all";
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
  | { allowed: true; dealerIds: string[] | "all" }
  | { allowed: false };

export async function resolveReportScope(db: D1Database, user: SessionUser): Promise<ReportScope> {
  if (user.role === "admin_staff") return { allowed: false };
  const scope = await getScopedDealerIds(db, user);
  if (scope === "all") return { allowed: true, dealerIds: "all" };
  if (!scope.length) return { allowed: true, dealerIds: "none" };
  return { allowed: true, dealerIds: scope };
}

export async function canAccessDealer(
  db: D1Database,
  user: SessionUser,
  dealerId: string,
): Promise<boolean> {
  const scope = await getAssignedDealerIds(db, user);
  if (scope === "all") return true;
  return scope.includes(dealerId);
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
  if (user.role === "master_admin" || user.role === "admin_staff") return true;
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
  if (user.role === "master_admin" || user.role === "admin_staff") return true;
  if (user.role === "dealer") return user.dealerId === complaint.dealer_id;
  if (user.role === "distributor" || user.role === "sales_executive") {
    return canAccessDealer(db, user, complaint.dealer_id);
  }
  return false;
}
