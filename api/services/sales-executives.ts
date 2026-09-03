import { formatInLabel } from "../utils";

/**
 * Read-only aggregation of ALL sales executives and their performance data. This powers the
 * admin "Sales Executives" section (used by master_admin and admin_staff). Every caller with
 * access sees every sales executive, so these queries are intentionally unscoped.
 *
 * Relationships used (no new tables):
 *   sales executive = users row with role='sales_executive'
 *   their dealers   = dealers WHERE sales_executive_user_id = <se>
 *   their visits     = dealer_visits WHERE sales_executive_user_id = <se>
 *   their orders     = orders for those dealers
 *   distributor      = users.distributor_id (fallback: distributor of a dealer they manage)
 */

export type SalesExecutiveRow = {
  id: string;
  name: string;
  phone: string;
  status: string;
  distributorId: string | null;
  distributorName: string | null;
  dealerCount: number;
  totalVisits: number;
  visitsThisMonth: number;
  totalOrders: number;
  pendingOrders: number;
  deliveredOrders: number;
  salesValue: number;
};

/** First day of the current month as an ISO instant (UTC), for "visits this month". */
function startOfMonthIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0)).toISOString();
}

export async function listSalesExecutives(db: D1Database): Promise<SalesExecutiveRow[]> {
  const monthStart = startOfMonthIso();

  // One pass over sales-executive users with correlated aggregates. Correlated subqueries keep
  // this a single round-trip and avoid N+1; the dataset (sales executives) is small.
  const { results } = await db
    .prepare(
      `SELECT
         u.id,
         u.name,
         u.phone,
         u.status,
         COALESCE(
           u.distributor_id,
           (SELECT d2.distributor_id FROM dealers d2
            WHERE d2.sales_executive_user_id = u.id AND d2.deleted_at IS NULL
            ORDER BY d2.created_at LIMIT 1)
         ) AS distributor_id,
         (SELECT dist.name FROM distributors dist WHERE dist.id = COALESCE(
            u.distributor_id,
            (SELECT d3.distributor_id FROM dealers d3
             WHERE d3.sales_executive_user_id = u.id AND d3.deleted_at IS NULL
             ORDER BY d3.created_at LIMIT 1)
         )) AS distributor_name,
         (SELECT COUNT(*) FROM dealers d
            WHERE d.sales_executive_user_id = u.id AND d.deleted_at IS NULL) AS dealer_count,
         (SELECT COUNT(*) FROM dealer_visits v
            WHERE v.sales_executive_user_id = u.id) AS total_visits,
         (SELECT COUNT(*) FROM dealer_visits v
            WHERE v.sales_executive_user_id = u.id AND v.check_in_at >= ?) AS visits_this_month,
         (SELECT COUNT(*) FROM orders o
            WHERE o.deleted_at IS NULL AND o.dealer_id IN (
              SELECT id FROM dealers WHERE sales_executive_user_id = u.id AND deleted_at IS NULL
            )) AS total_orders,
         (SELECT COUNT(*) FROM orders o
            WHERE o.deleted_at IS NULL AND o.status IN ('order_placed','pending_approval')
              AND o.dealer_id IN (
                SELECT id FROM dealers WHERE sales_executive_user_id = u.id AND deleted_at IS NULL
              )) AS pending_orders,
         (SELECT COUNT(*) FROM orders o
            WHERE o.deleted_at IS NULL AND o.status = 'delivered'
              AND o.dealer_id IN (
                SELECT id FROM dealers WHERE sales_executive_user_id = u.id AND deleted_at IS NULL
              )) AS delivered_orders,
         (SELECT COALESCE(SUM(o.total_value), 0) FROM orders o
            WHERE o.deleted_at IS NULL AND o.status NOT IN ('rejected','cancelled')
              AND o.dealer_id IN (
                SELECT id FROM dealers WHERE sales_executive_user_id = u.id AND deleted_at IS NULL
              )) AS sales_value
       FROM users u
       WHERE u.role = 'sales_executive' AND u.deleted_at IS NULL
       ORDER BY u.name`,
    )
    .bind(monthStart)
    .all<Record<string, unknown>>();

  return results.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    phone: r.phone as string,
    status: r.status as string,
    distributorId: (r.distributor_id as string) ?? null,
    distributorName: (r.distributor_name as string) ?? null,
    dealerCount: Number(r.dealer_count ?? 0),
    totalVisits: Number(r.total_visits ?? 0),
    visitsThisMonth: Number(r.visits_this_month ?? 0),
    totalOrders: Number(r.total_orders ?? 0),
    pendingOrders: Number(r.pending_orders ?? 0),
    deliveredOrders: Number(r.delivered_orders ?? 0),
    salesValue: Number(r.sales_value ?? 0),
  }));
}

export type SalesExecutiveDetail = SalesExecutiveRow & {
  dealers: Array<{
    id: string;
    storeName: string;
    code: string;
    location: string;
    active: boolean;
  }>;
  recentVisits: Array<{
    id: string;
    dealerName: string;
    storeName: string;
    status: string;
    checkInAt: string;
    checkOutAt: string | null;
    durationMinutes: number | null;
  }>;
};

export async function getSalesExecutiveDetail(
  db: D1Database,
  salesExecutiveUserId: string,
): Promise<SalesExecutiveDetail | null> {
  const list = await listSalesExecutives(db);
  const base = list.find((r) => r.id === salesExecutiveUserId);
  if (!base) return null;

  const { results: dealerRows } = await db
    .prepare(
      `SELECT id, store_name, code, location, active
       FROM dealers
       WHERE sales_executive_user_id = ? AND deleted_at IS NULL
       ORDER BY store_name`,
    )
    .bind(salesExecutiveUserId)
    .all<Record<string, unknown>>();

  const { results: visitRows } = await db
    .prepare(
      `SELECT id, dealer_name, store_name, status, check_in_at, check_out_at
       FROM dealer_visits
       WHERE sales_executive_user_id = ?
       ORDER BY check_in_at DESC
       LIMIT 20`,
    )
    .bind(salesExecutiveUserId)
    .all<Record<string, unknown>>();

  return {
    ...base,
    dealers: dealerRows.map((d) => ({
      id: d.id as string,
      storeName: d.store_name as string,
      code: d.code as string,
      location: d.location as string,
      active: Boolean(d.active),
    })),
    recentVisits: visitRows.map((v) => {
      const checkInAt = v.check_in_at as string;
      const checkOutAt = (v.check_out_at as string) ?? null;
      const durationMinutes = checkOutAt
        ? Math.max(
            0,
            Math.round((new Date(checkOutAt).getTime() - new Date(checkInAt).getTime()) / 60000),
          )
        : null;
      return {
        id: v.id as string,
        dealerName: v.dealer_name as string,
        storeName: v.store_name as string,
        status: v.status as string,
        checkInAt: formatInLabel(checkInAt),
        checkOutAt: checkOutAt ? formatInLabel(checkOutAt) : null,
        durationMinutes,
      };
    }),
  };
}
