import { formatInLabel } from "../utils";

const VALID_ORDER_STATUSES = `'approved','in_making','out_for_delivery','delivered','order_placed','pending_approval'`;

export async function loadDealerStats(db: D1Database, dealerId: string) {
  const row = await db
    .prepare(
      `SELECT
        COALESCE((
          SELECT balance_after FROM points_ledger
          WHERE dealer_id = ? ORDER BY occurred_at DESC LIMIT 1
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
    rewardPoints: row?.reward_points ?? 0,
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

export async function mapDealerRow(db: D1Database, row: Record<string, unknown>) {
  const stats = await loadDealerStats(db, row.id as string);
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

export { VALID_ORDER_STATUSES };
