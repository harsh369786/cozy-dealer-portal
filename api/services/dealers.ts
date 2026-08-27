import { formatInLabel } from "../utils";
import { coerceRewardPoints } from "./reward-points";

const VALID_ORDER_STATUSES = `'approved','in_making','out_for_delivery','delivered','order_placed','pending_approval'`;

export async function loadDealerStats(db: D1Database, dealerId: string) {
  const row = await db
    .prepare(
      `SELECT
        COALESCE((
          SELECT SUM(delta) FROM points_ledger WHERE dealer_id = ?
        ), 0) as reward_points,
        COALESCE((
          SELECT SUM(total_value) FROM orders
          WHERE dealer_id = ? AND deleted_at IS NULL
            AND status NOT IN ('rejected', 'cancelled')
        ), 0) as total_sales,
        COALESCE((
          SELECT SUM(total_value) FROM orders
          WHERE dealer_id = ? AND deleted_at IS NULL
            AND status NOT IN ('rejected', 'cancelled')
            AND strftime('%Y-%m', placed_at) = strftime('%Y-%m', 'now')
        ), 0) as month_sales,
        COALESCE((
          SELECT SUM(total_value) FROM orders
          WHERE dealer_id = ? AND deleted_at IS NULL
            AND status NOT IN ('rejected', 'cancelled')
            AND strftime('%Y-%m', placed_at) = strftime('%Y-%m', 'now', '-1 month')
        ), 0) as prev_month_sales,
        COALESCE((
          SELECT COUNT(*) FROM orders
          WHERE dealer_id = ? AND deleted_at IS NULL
            AND status NOT IN ('rejected', 'cancelled')
        ), 0) as order_count,
        COALESCE((
          SELECT COUNT(*) FROM orders
          WHERE dealer_id = ? AND deleted_at IS NULL
            AND status IN ('order_placed', 'pending_approval')
        ), 0) as pending_orders,
        COALESCE((
          SELECT COUNT(*) FROM complaints
          WHERE dealer_id = ? AND deleted_at IS NULL
            AND status IN ('pending', 'in_progress')
        ), 0) as open_complaints,
        (
          SELECT placed_at FROM orders
          WHERE dealer_id = ? AND deleted_at IS NULL
          ORDER BY placed_at DESC LIMIT 1
        ) as last_order_at`,
    )
    .bind(
      dealerId,
      dealerId,
      dealerId,
      dealerId,
      dealerId,
      dealerId,
      dealerId,
      dealerId,
    )
    .first<{
      reward_points: number;
      total_sales: number;
      month_sales: number;
      prev_month_sales: number;
      order_count: number;
      pending_orders: number;
      open_complaints: number;
      last_order_at: string | null;
    }>();

  const monthSales = row?.month_sales ?? 0;
  const prevMonthSales = row?.prev_month_sales ?? 0;
  const salesGrowth =
    prevMonthSales > 0
      ? Math.round(((monthSales - prevMonthSales) / prevMonthSales) * 100)
      : monthSales > 0
        ? 100
        : 0;

  return {
    rewardPoints: coerceRewardPoints(row?.reward_points, 0),
    totalSales: row?.total_sales ?? 0,
    monthSales,
    prevMonthSales,
    orderCount: row?.order_count ?? 0,
    pendingOrders: row?.pending_orders ?? 0,
    openComplaints: row?.open_complaints ?? 0,
    salesGrowth,
    lastOrderDate: row?.last_order_at ? formatInLabel(row.last_order_at) : "",
  };
}

type DealerStats = Awaited<ReturnType<typeof loadDealerStats>>;

function emptyDealerStats(): DealerStats {
  return {
    rewardPoints: 0,
    totalSales: 0,
    monthSales: 0,
    prevMonthSales: 0,
    orderCount: 0,
    pendingOrders: 0,
    openComplaints: 0,
    salesGrowth: 0,
    lastOrderDate: "",
  };
}

function statsFromRow(row: {
  reward_points?: number;
  total_sales: number;
  month_sales: number;
  prev_month_sales: number;
  order_count: number;
  pending_orders: number;
  open_complaints?: number;
  last_order_at: string | null;
}): DealerStats {
  const monthSales = row.month_sales ?? 0;
  const prevMonthSales = row.prev_month_sales ?? 0;
  const salesGrowth =
    prevMonthSales > 0
      ? Math.round(((monthSales - prevMonthSales) / prevMonthSales) * 100)
      : monthSales > 0
        ? 100
        : 0;
  return {
    rewardPoints: coerceRewardPoints(row.reward_points, 0),
    totalSales: row.total_sales ?? 0,
    monthSales,
    prevMonthSales,
    orderCount: row.order_count ?? 0,
    pendingOrders: row.pending_orders ?? 0,
    openComplaints: row.open_complaints ?? 0,
    salesGrowth,
    lastOrderDate: row.last_order_at ? formatInLabel(row.last_order_at) : "",
  };
}

export async function loadDealerStatsBatch(db: D1Database, dealerIds: string[]) {
  const map = new Map<string, DealerStats>();
  if (!dealerIds.length) return map;
  const placeholders = dealerIds.map(() => "?").join(",");

  const [orderRows, pointsRows, complaintRows] = await Promise.all([
    db
      .prepare(
        `SELECT dealer_id,
            COALESCE(SUM(CASE WHEN deleted_at IS NULL AND status NOT IN ('rejected', 'cancelled') THEN total_value ELSE 0 END), 0) as total_sales,
            COALESCE(SUM(CASE WHEN deleted_at IS NULL AND status NOT IN ('rejected', 'cancelled') AND strftime('%Y-%m', placed_at) = strftime('%Y-%m', 'now') THEN total_value ELSE 0 END), 0) as month_sales,
            COALESCE(SUM(CASE WHEN deleted_at IS NULL AND status NOT IN ('rejected', 'cancelled') AND strftime('%Y-%m', placed_at) = strftime('%Y-%m', 'now', '-1 month') THEN total_value ELSE 0 END), 0) as prev_month_sales,
            COALESCE(SUM(CASE WHEN deleted_at IS NULL AND status NOT IN ('rejected', 'cancelled') THEN 1 ELSE 0 END), 0) as order_count,
            COALESCE(SUM(CASE WHEN deleted_at IS NULL AND status IN ('order_placed', 'pending_approval') THEN 1 ELSE 0 END), 0) as pending_orders,
            MAX(CASE WHEN deleted_at IS NULL THEN placed_at END) as last_order_at
         FROM orders WHERE dealer_id IN (${placeholders})
         GROUP BY dealer_id`,
      )
      .bind(...dealerIds)
      .all<{
        dealer_id: string;
        total_sales: number;
        month_sales: number;
        prev_month_sales: number;
        order_count: number;
        pending_orders: number;
        last_order_at: string | null;
      }>(),
    db
      .prepare(
        `SELECT dealer_id, COALESCE(SUM(delta), 0) as reward_points
         FROM points_ledger WHERE dealer_id IN (${placeholders})
         GROUP BY dealer_id`,
      )
      .bind(...dealerIds)
      .all<{ dealer_id: string; reward_points: number }>(),
    db
      .prepare(
        `SELECT dealer_id, COUNT(*) as open_complaints
         FROM complaints
         WHERE dealer_id IN (${placeholders}) AND deleted_at IS NULL AND status IN ('pending', 'in_progress')
         GROUP BY dealer_id`,
      )
      .bind(...dealerIds)
      .all<{ dealer_id: string; open_complaints: number }>(),
  ]);

  const pointsByDealer = new Map(pointsRows.results.map((r) => [r.dealer_id, r.reward_points]));
  const complaintsByDealer = new Map(complaintRows.results.map((r) => [r.dealer_id, r.open_complaints]));

  for (const row of orderRows.results) {
    map.set(
      row.dealer_id,
      statsFromRow({
        ...row,
        reward_points: pointsByDealer.get(row.dealer_id) ?? 0,
        open_complaints: complaintsByDealer.get(row.dealer_id) ?? 0,
      }),
    );
  }
  for (const id of dealerIds) {
    if (map.has(id)) continue;
    map.set(
      id,
      statsFromRow({
        reward_points: pointsByDealer.get(id) ?? 0,
        total_sales: 0,
        month_sales: 0,
        prev_month_sales: 0,
        order_count: 0,
        pending_orders: 0,
        open_complaints: complaintsByDealer.get(id) ?? 0,
        last_order_at: null,
      }),
    );
  }
  return map;
}

function toDealerDto(row: Record<string, unknown>, stats: DealerStats) {
  return {
    id: row.id,
    distributorId: row.distributor_id,
    salesExecutiveId: row.sales_executive_user_id,
    code: row.code,
    name: row.store_name,
    contactName: row.contact_name,
    location: row.location,
    address: row.address,
    phone: row.phone,
    email: row.email,
    gstNumber: row.gst_number,
    active: Boolean(row.active),
    ...stats,
  };
}

export async function mapDealerRow(db: D1Database, row: Record<string, unknown>) {
  const stats = await loadDealerStats(db, row.id as string);
  return toDealerDto(row, stats);
}

export async function mapDealerRows(db: D1Database, rows: Record<string, unknown>[]) {
  if (!rows.length) return [];
  const statsMap = await loadDealerStatsBatch(
    db,
    rows.map((row) => row.id as string),
  );
  return rows.map((row) => toDealerDto(row, statsMap.get(row.id as string) ?? emptyDealerStats()));
}

export { VALID_ORDER_STATUSES };
