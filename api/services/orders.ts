import { formatInLabel, id, nextOrderId, nowIso } from "../utils";
import type { SessionUser } from "../types";
import {
  assertStatusUpdate,
  canRoleSetStatus,
  normalizeLegacyStatus,
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  type OrderStatus,
} from "../order-status";
import { buildPriceQuote } from "./pricing";
import { pricingDimensions } from "./mattress-pricing";
import { enqueueWhatsapp } from "./whatsapp";
import { coerceRewardPoints } from "./reward-points";
import {
  notifyNewOrder,
  notifyOrderStatusChange,
} from "./notification-events";

type CreateOrderInput = {
  productId: string;
  quantity: number;
  thickness?: string;
  sizeRequested?: string;
  sizeStandard?: string;
  lengthIn?: number;
  breadthIn?: number;
  campaignId?: string;
  perma?: boolean;
  permaCorners?: string;
  permaNotes?: string;
  salespersonId?: string;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  customerEmail?: string;
  notes?: string;
};

async function addTimelineEvent(
  db: D1Database,
  orderId: string,
  statusKey: OrderStatus,
  label: string,
  actorUserId: string | null,
  note?: string,
) {
  await db
    .prepare(
      `INSERT INTO order_timeline_events (id, order_id, label, status_key, occurred_at, note, actor_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id("te"), orderId, label, statusKey, nowIso(), note ?? null, actorUserId)
    .run();
}

function buildOrderWhatsappPayload(
  orderId: string,
  order: {
    totalValue: number;
    totalItems: number;
    items: Array<{
      model: string;
      size: string;
      thickness: string;
      quantity: number;
      mrp: number;
      dealerPrice: number;
      campaignPrice?: number | null;
    }>;
  },
) {
  return {
    orderId,
    total: order.totalValue,
    totalItems: order.totalItems,
    items: order.items.map((i) => ({
      model: i.model,
      size: i.size,
      thickness: i.thickness,
      quantity: i.quantity,
      price: i.campaignPrice ?? i.dealerPrice,
    })),
  };
}

export async function createOrder(
  db: D1Database,
  user: { id: string; dealerId?: string },
  input: CreateOrderInput,
  env: { WHATSAPP_QUEUE?: Queue },
) {
  if (!user.dealerId) throw new Error("Dealer account required");

  const dealer = await db
    .prepare(`SELECT * FROM dealers WHERE id = ? AND deleted_at IS NULL`)
    .bind(user.dealerId)
    .first<{ distributor_id: string; store_name: string; phone: string }>();
  if (!dealer) throw new Error("Dealer not found");

  const quote = await buildPriceQuote(db, {
    productId: input.productId,
    quantity: input.quantity,
    thickness: input.thickness,
    campaignId: input.campaignId,
    lengthIn: input.lengthIn,
    breadthIn: input.breadthIn,
    dealerId: user.dealerId,
    distributorId: dealer.distributor_id,
  });

  const standardDims = pricingDimensions(input.lengthIn, input.breadthIn);
  const sizeStandard =
    standardDims.lengthIn && standardDims.breadthIn
      ? `${standardDims.lengthIn}" × ${standardDims.breadthIn}"`
      : input.sizeStandard ?? null;

  const placedAt = nowIso();
  const placedDate = new Date(placedAt);

  let orderId = await nextOrderId(db, placedDate);
  const itemId = id("oi");
  const timelineId = id("te");
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await db.batch([
        db
          .prepare(
            `INSERT INTO orders (id, dealer_id, distributor_id, placed_by_user_id, salesperson_id, status, placed_at,
              customer_name, customer_phone, customer_address, customer_email, total_items, total_value, notes)
             VALUES (?, ?, ?, ?, ?, 'order_placed', ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            orderId,
            user.dealerId,
            dealer.distributor_id,
            user.id,
            input.salespersonId ?? null,
            placedAt,
            input.customerName ?? null,
            input.customerPhone ?? null,
            input.customerAddress ?? null,
            input.customerEmail ?? null,
            input.quantity,
            quote.lineTotal,
            input.notes ?? null,
          ),
        db
          .prepare(
            `INSERT INTO order_items (id, order_id, product_id, product_name, size_requested, size_standard, thickness,
              quantity, perma, perma_corners, perma_notes, mrp, dealer_price, dealer_margin_percent,
              distributor_price, distributor_margin_percent, campaign_id, campaign_price, discount_percent,
              free_items, points_earned, line_total, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            itemId,
            orderId,
            quote.productId,
            quote.productName,
            input.sizeRequested ?? null,
            sizeStandard,
            input.thickness ?? null,
            input.quantity,
            input.perma ? 1 : 0,
            input.permaCorners ?? null,
            input.permaNotes ?? null,
            quote.mrp,
            quote.dealerPrice,
            quote.dealerMarginPercent,
            quote.distributorPrice,
            quote.distributorMarginPercent,
            quote.campaignId,
            quote.campaignPrice,
            quote.discountPercent,
            quote.freeItems,
            quote.pointsEarned,
            quote.lineTotal,
            input.notes ?? null,
          ),
        db
          .prepare(
            `INSERT INTO order_timeline_events (id, order_id, label, status_key, occurred_at, note, actor_user_id)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(timelineId, orderId, ORDER_STATUS_LABELS.order_placed, "order_placed", placedAt, null, user.id),
      ]);
      break;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes("UNIQUE") || attempt === 2) throw err;
      orderId = await nextOrderId(db, placedDate);
    }
  }

  await notifyNewOrder(db, orderId, dealer.id, dealer.store_name, dealer.distributor_id, user.id);

  const order = await getOrderById(db, orderId);
  if (order && dealer.phone) {
    await enqueueWhatsapp(db, env, {
      toPhone: dealer.phone,
      templateKey: "order_placed",
      payload: buildOrderWhatsappPayload(orderId, order),
    });
  }

  return order;
}

export async function approveOrder(
  db: D1Database,
  orderId: string,
  actor: SessionUser,
  env: { WHATSAPP_QUEUE?: Queue },
) {
  if (!canRoleSetStatus(actor.role, "approved")) {
    throw new Error("Your role cannot approve orders");
  }
  return updateOrderStatus(db, orderId, "approved", actor, env);
}

export async function rejectOrder(
  db: D1Database,
  orderId: string,
  reason: string,
  actor: SessionUser,
  env: { WHATSAPP_QUEUE?: Queue },
) {
  if (actor.role !== "distributor" && actor.role !== "master_admin") {
    throw new Error("Your role cannot reject orders");
  }
  const order = await db
    .prepare(`SELECT status FROM orders WHERE id = ?`)
    .bind(orderId)
    .first<{ status: string }>();
  if (!order) throw new Error("Order not found");
  const from = normalizeLegacyStatus(order.status);
  if (from !== "order_placed") throw new Error("Order cannot be rejected in its current status");

  const rejectedAt = nowIso();
  await db
    .prepare(
      `UPDATE orders SET status = 'rejected', rejected_at = ?, rejection_reason = ?, updated_at = ? WHERE id = ?`,
    )
    .bind(rejectedAt, reason, rejectedAt, orderId)
    .run();

  await addTimelineEvent(db, orderId, "rejected", ORDER_STATUS_LABELS.rejected, actor.id, reason);

  await notifyOrderStatusChange(db, orderId, "rejected", { reason, actorUserId: actor.id });

  const dealer = await db
    .prepare(`SELECT phone FROM dealers WHERE id = (SELECT dealer_id FROM orders WHERE id = ?)`)
    .bind(orderId)
    .first<{ phone: string }>();

  if (dealer) {
    await enqueueWhatsapp(db, env, {
      toPhone: dealer.phone,
      templateKey: "order_rejected",
      payload: { orderId, reason },
    });
  }

  return getOrderById(db, orderId);
}

export async function cancelApprovedOrder(
  db: D1Database,
  orderId: string,
  actor: SessionUser,
  reason?: string,
) {
  if (actor.role !== "master_admin") {
    throw new Error("Only master admin can cancel approved orders");
  }
  const order = await db
    .prepare(`SELECT status FROM orders WHERE id = ?`)
    .bind(orderId)
    .first<{ status: string }>();
  if (!order) throw new Error("Order not found");
  const from = normalizeLegacyStatus(order.status);
  if (from !== "approved") throw new Error("Only approved orders can be cancelled");

  const cancelledAt = nowIso();
  await db
    .prepare(
      `UPDATE orders SET status = 'cancelled', rejection_reason = ?, updated_at = ? WHERE id = ?`,
    )
    .bind(reason ?? null, cancelledAt, orderId)
    .run();

  await addTimelineEvent(
    db,
    orderId,
    "cancelled",
    ORDER_STATUS_LABELS.cancelled,
    actor.id,
    reason,
  );

  await notifyOrderStatusChange(db, orderId, "cancelled", { reason, actorUserId: actor.id });

  return getOrderById(db, orderId);
}

export async function updateOrderStatus(
  db: D1Database,
  orderId: string,
  toStatus: OrderStatus,
  actor: SessionUser,
  env: { WHATSAPP_QUEUE?: Queue },
) {
  const order = await db
    .prepare(`SELECT * FROM orders WHERE id = ?`)
    .bind(orderId)
    .first<Record<string, unknown>>();
  if (!order) throw new Error("Order not found");

  const from = normalizeLegacyStatus(order.status as string);
  assertStatusUpdate(actor, from, toStatus);

  const updatedAt = nowIso();
  const updates: Record<string, string | null> = { updated_at: updatedAt };
  if (toStatus === "approved") updates.approved_at = updatedAt;
  if (toStatus === "delivered") updates.delivered_at = updatedAt;

  const fromStatus = order.status as string;
  const setClause = Object.keys(updates)
    .map((k) => `${k} = ?`)
    .concat("status = ?")
    .join(", ");

  // Atomic: the guarded status UPDATE and its timeline event commit together in one D1 batch.
  // The timeline INSERT is conditional on the order actually transitioning to toStatus, so a
  // failed optimistic lock leaves no orphan timeline row.
  const [statusResult] = await db.batch([
    db
      .prepare(`UPDATE orders SET ${setClause} WHERE id = ? AND status = ?`)
      .bind(...Object.values(updates), toStatus, orderId, fromStatus),
    db
      .prepare(
        `INSERT INTO order_timeline_events (id, order_id, label, status_key, occurred_at, note, actor_user_id)
         SELECT ?, ?, ?, ?, ?, ?, ?
         WHERE (SELECT status FROM orders WHERE id = ?) = ?`,
      )
      .bind(
        id("te"),
        orderId,
        ORDER_STATUS_LABELS[toStatus],
        toStatus,
        updatedAt,
        null,
        actor.id,
        orderId,
        toStatus,
      ),
  ]);
  if ((statusResult.meta.changes ?? 0) !== 1) {
    throw new Error("Order status changed. Refresh and try again.");
  }

  if (toStatus === "delivered") {
    const points = await handleOrderDelivered(db, orderId, env, order);
    await notifyOrderStatusChange(db, orderId, "delivered", { points, actorUserId: actor.id });
  } else {
    await notifyOrderStatusChange(db, orderId, toStatus, { actorUserId: actor.id });
  }

  return getOrderById(db, orderId);
}

async function handleOrderDelivered(
  db: D1Database,
  orderId: string,
  env: { WHATSAPP_QUEUE?: Queue },
  existingOrder?: Record<string, unknown>,
): Promise<number> {
  const order =
    existingOrder ??
    (await db
      .prepare(`SELECT * FROM orders WHERE id = ?`)
      .bind(orderId)
      .first<Record<string, unknown>>());
  if (!order) return 0;

  const items = await db
    .prepare(
      `SELECT oi.points_earned, oi.quantity, oi.product_name, oi.size_requested, oi.size_standard, oi.thickness,
        oi.mrp, oi.dealer_price, oi.campaign_price
       FROM order_items oi WHERE oi.order_id = ?`,
    )
    .bind(orderId)
    .all<{
      points_earned: number | null;
      quantity: number;
      product_name: string;
      size_requested: string | null;
      size_standard: string | null;
      thickness: string;
      mrp: number;
      dealer_price: number;
      campaign_price: number | null;
    }>();

  const dealerPoints = coerceRewardPoints(
    items.results.reduce((sum, item) => sum + Number(item.points_earned ?? 0), 0),
    0,
  );

  const creditedAt = nowIso();
  let creditedPoints = 0;
  if (dealerPoints > 0) {
    const dealerId = order.dealer_id as string;
    const current = await db
      .prepare(`SELECT COALESCE(SUM(delta), 0) AS balance FROM points_ledger WHERE dealer_id = ?`)
      .bind(dealerId)
      .first<{ balance: number | string }>();
    const balanceAfter = Math.max(0, coerceRewardPoints(current?.balance, 0) + dealerPoints);
    try {
      await db.batch([
        db
          .prepare(
            `UPDATE orders SET rewards_credited_at = ? WHERE id = ? AND rewards_credited_at IS NULL`,
          )
          .bind(creditedAt, orderId),
        db
          .prepare(
            `INSERT INTO points_ledger (id, dealer_id, delta, balance_after, label, reference_type, reference_id, occurred_at)
             VALUES (?, ?, ?, ?, ?, 'order', ?, ?)`,
          )
          .bind(
            id("pl"),
            dealerId,
            dealerPoints,
            balanceAfter,
            `Order ${orderId} delivered`,
            orderId,
            creditedAt,
          ),
      ]);
      creditedPoints = dealerPoints;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes("UNIQUE")) throw err;
    }
  }

  const dealer = await db
    .prepare(`SELECT phone, store_name FROM dealers WHERE id = ?`)
    .bind(order.dealer_id)
    .first<{ phone: string; store_name: string }>();

  if (dealer) {
    const whatsappOrder = {
      totalValue: Number(order.total_value ?? 0),
      totalItems: Number(order.total_items ?? items.results.length),
      items: items.results.map((item) => ({
        model: item.product_name,
        size: item.size_standard ?? item.size_requested ?? "",
        thickness: item.thickness,
        quantity: item.quantity,
        mrp: item.mrp,
        dealerPrice: item.dealer_price,
        campaignPrice: item.campaign_price,
      })),
    };
    await enqueueWhatsapp(db, env, {
      toPhone: dealer.phone,
      templateKey: "order_delivered",
      payload: buildOrderWhatsappPayload(orderId, whatsappOrder),
    });
  }

  return creditedPoints;
}

const PERMA_CORNER_LABELS: Record<string, string> = {
  tl: "Top left",
  tr: "Top right",
  bl: "Bottom left",
  br: "Bottom right",
};

function parsePermaCorners(raw: unknown): string[] | undefined {
  if (!raw || typeof raw !== "string") return undefined;
  try {
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    const labels = Object.entries(parsed)
      .filter(([, on]) => on)
      .map(([key]) => PERMA_CORNER_LABELS[key] ?? key);
    return labels.length ? labels : undefined;
  } catch {
    const trimmed = raw.trim();
    return trimmed ? [trimmed] : undefined;
  }
}

function mapOrderItemRow(i: Record<string, unknown>) {
  return {
    productId: i.product_id,
    model: i.product_name,
    size: i.size_standard ?? i.size_requested ?? "",
    sizeRequested: i.size_requested,
    sizeStandard: i.size_standard,
    thickness: i.thickness ?? "—",
    quantity: i.quantity,
    campaignId: i.campaign_id,
    farma: Boolean(i.perma),
    farmaDetails: i.perma_notes,
    farmaCorners: parsePermaCorners(i.perma_corners),
    mrp: i.mrp,
    dealerPrice: i.dealer_price,
    campaignPrice: i.campaign_price,
    freeItems: i.free_items,
    points: i.points_earned,
    notes: i.notes,
  };
}

export async function getOrderById(db: D1Database, orderId: string) {
  const order = await db
    .prepare(
      `SELECT o.*, d.store_name as dealer_name, d.code as dealer_code, d.address as dealer_address,
              d.phone as dealer_phone, d.contact_name,
              dist.name as distributor_name
       FROM orders o
       JOIN dealers d ON d.id = o.dealer_id
       JOIN distributors dist ON dist.id = o.distributor_id
       WHERE o.id = ? AND o.deleted_at IS NULL`,
    )
    .bind(orderId)
    .first<Record<string, unknown>>();
  if (!order) return null;

  const items = await db
    .prepare(`SELECT * FROM order_items WHERE order_id = ?`)
    .bind(orderId)
    .all<Record<string, unknown>>();

  const timeline = await db
    .prepare(
      `SELECT t.label, t.status_key, t.occurred_at, t.note, u.name as actor_name
       FROM order_timeline_events t
       LEFT JOIN users u ON u.id = t.actor_user_id
       WHERE t.order_id = ? ORDER BY t.occurred_at`,
    )
    .bind(orderId)
    .all<{
      label: string;
      status_key: string | null;
      occurred_at: string;
      note: string | null;
      actor_name: string | null;
    }>();

  const status = normalizeLegacyStatus(order.status as string);
  const placedAt = order.placed_at as string;
  const pendingHours =
    status === "order_placed"
      ? Math.floor((Date.now() - new Date(placedAt).getTime()) / 3600000)
      : 0;

  const deliveredEvent = timeline.results.find((t) => t.status_key === "delivered");
  const deliveryDate = deliveredEvent ? formatInLabel(deliveredEvent.occurred_at) : undefined;

  return {
    id: order.id,
    distributorId: order.distributor_id,
    distributorName: order.distributor_name,
    dealerId: order.dealer_id,
    dealerName: order.dealer_name,
    dealerCode: order.dealer_code,
    storeName: order.dealer_name,
    contactName: order.contact_name,
    dealerAddress: order.dealer_address,
    dealerPhone: order.dealer_phone,
    status,
    placedAt: formatInLabel(placedAt),
    approvedAt: order.approved_at ? formatInLabel(order.approved_at as string) : undefined,
    rejectedAt: order.rejected_at ? formatInLabel(order.rejected_at as string) : undefined,
    rejectionReason: order.rejection_reason,
    customerName: order.customer_name,
    customerPhone: order.customer_phone,
    customerAddress: order.customer_address,
    deliveryDate,
    totalItems: order.total_items,
    totalValue: order.total_value,
    pendingHours,
    notes: (order.notes as string) ?? undefined,
    items: items.results.map(mapOrderItemRow),
    timeline: timeline.results.map((t) => ({
      status: t.status_key ?? undefined,
      label: t.label,
      at: formatInLabel(t.occurred_at),
      updatedBy: t.actor_name ?? undefined,
      note: t.note ?? undefined,
    })),
  };
}

async function batchOrderItems(db: D1Database, orderIds: string[]) {
  const map = new Map<string, Record<string, unknown>[]>();
  if (!orderIds.length) return map;

  const chunkSize = 90;
  for (let i = 0; i < orderIds.length; i += chunkSize) {
    const chunk = orderIds.slice(i, i + chunkSize);
    const placeholders = chunk.map(() => "?").join(",");
    const { results } = await db
      .prepare(`SELECT * FROM order_items WHERE order_id IN (${placeholders}) ORDER BY order_id, id`)
      .bind(...chunk)
      .all<Record<string, unknown>>();

    for (const item of results) {
      const orderId = item.order_id as string;
      const list = map.get(orderId) ?? [];
      list.push(item);
      map.set(orderId, list);
    }
  }
  return map;
}

function mapListOrderRow(
  order: Record<string, unknown>,
  items: Record<string, unknown>[],
) {
  const status = normalizeLegacyStatus(order.status as string);
  const placedAt = order.placed_at as string;
  const pendingHours =
    status === "order_placed"
      ? Math.floor((Date.now() - new Date(placedAt).getTime()) / 3600000)
      : 0;

  return {
    id: order.id,
    distributorId: order.distributor_id,
    distributorName: order.distributor_name,
    dealerId: order.dealer_id,
    dealerName: order.dealer_name,
    dealerCode: order.dealer_code,
    storeName: order.dealer_name,
    contactName: order.contact_name,
    dealerAddress: order.dealer_address,
    status,
    placedAt: formatInLabel(placedAt),
    approvedAt: order.approved_at ? formatInLabel(order.approved_at as string) : undefined,
    rejectedAt: order.rejected_at ? formatInLabel(order.rejected_at as string) : undefined,
    rejectionReason: order.rejection_reason,
    customerName: order.customer_name,
    customerPhone: order.customer_phone,
    totalItems: order.total_items,
    totalValue: order.total_value,
    pendingHours,
    notes: (order.notes as string) ?? undefined,
    items: items.map(mapOrderItemRow),
    timeline: [],
  };
}

export type ListOrdersOptions = {
  dealerIds?: string[];
  distributorId?: string;
  salesExecutiveUserId?: string;
  status?: string;
  search?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  pageSize?: number;
};

export type PaginatedOrders = {
  items: Awaited<ReturnType<typeof mapListOrderRow>>[];
  total: number;
  summary: {
    totalSales: number;
    totalPoints: number;
  };
  page: number;
  pageSize: number;
  totalPages: number;
};

const ORDER_LIST_FROM = `FROM orders o
  JOIN dealers d ON d.id = o.dealer_id
  JOIN distributors dist ON dist.id = o.distributor_id`;

const ORDER_LIST_SELECT = `SELECT o.*, d.store_name as dealer_name, d.code as dealer_code, d.address as dealer_address, d.contact_name,
  dist.name as distributor_name`;

const DEFAULT_UNPAGINATED_LIMIT = 500;

function buildOrdersWhereClause(opts: ListOrdersOptions): { clause: string; binds: unknown[] } {
  let clause = `WHERE o.deleted_at IS NULL`;
  const binds: unknown[] = [];

  if (opts.dealerIds?.length) {
    clause += ` AND o.dealer_id IN (${opts.dealerIds.map(() => "?").join(",")})`;
    binds.push(...opts.dealerIds);
  }
  if (opts.distributorId) {
    clause += ` AND o.distributor_id = ?`;
    binds.push(opts.distributorId);
  }
  if (opts.salesExecutiveUserId) {
    clause += ` AND o.dealer_id IN (SELECT id FROM dealers WHERE sales_executive_user_id = ? AND deleted_at IS NULL)`;
    binds.push(opts.salesExecutiveUserId);
  }
  if (opts.status) {
    if (opts.status === "pending" || opts.status === "order_placed" || opts.status === "pending_approval") {
      clause += ` AND o.status IN ('order_placed', 'pending_approval')`;
    } else if (opts.status === "in_making" || opts.status === "in_production") {
      clause += ` AND o.status IN ('in_making', 'in_production')`;
    } else {
      clause += ` AND o.status = ?`;
      binds.push(opts.status);
    }
  }
  if (opts.search) {
    clause += ` AND (o.id LIKE ? OR d.store_name LIKE ? OR d.code LIKE ?)`;
    const q = `%${opts.search}%`;
    binds.push(q, q, q);
  }
  if (opts.fromDate) {
    clause += ` AND o.placed_at >= ?`;
    binds.push(`${opts.fromDate}T00:00:00.000Z`);
  }
  if (opts.toDate) {
    clause += ` AND o.placed_at <= ?`;
    binds.push(`${opts.toDate}T23:59:59.999Z`);
  }

  return { clause, binds };
}

export async function listOrders(
  db: D1Database,
  opts: ListOrdersOptions,
): Promise<PaginatedOrders | Awaited<ReturnType<typeof mapListOrderRow>>[]> {
  const { clause, binds: filterBinds } = buildOrdersWhereClause(opts);
  const paginate = opts.page != null || opts.pageSize != null;
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 50));

  let total = 0;
  let totalSales = 0;
  let totalPoints = 0;
  if (paginate) {
    const countRow = await db
      .prepare(`SELECT COUNT(*) AS total ${ORDER_LIST_FROM} ${clause}`)
      .bind(...filterBinds)
      .first<{ total: number }>();
    total = Number(countRow?.total ?? 0);

    const summaryClause =
      !opts.status || (opts.status !== "rejected" && opts.status !== "cancelled")
        ? `${clause} AND o.status NOT IN ('rejected', 'cancelled')`
        : clause;
    const summaryRow = await db
      .prepare(
        `SELECT
           COALESCE(SUM(o.total_value), 0) AS total_sales,
           COALESCE(SUM(item_points.points), 0) AS total_points
         ${ORDER_LIST_FROM}
         LEFT JOIN (
           SELECT order_id, SUM(points_earned) AS points
           FROM order_items
           GROUP BY order_id
         ) item_points ON item_points.order_id = o.id
         ${summaryClause}`,
      )
      .bind(...filterBinds)
      .first<{ total_sales: number; total_points: number }>();
    totalSales = Number(summaryRow?.total_sales ?? 0);
    totalPoints = Number(summaryRow?.total_points ?? 0);
  }

  const execBinds = [...filterBinds];
  let sql = `${ORDER_LIST_SELECT} ${ORDER_LIST_FROM} ${clause} ORDER BY o.placed_at DESC`;
  if (paginate) {
    sql += ` LIMIT ? OFFSET ?`;
    execBinds.push(pageSize, (page - 1) * pageSize);
  } else {
    sql += ` LIMIT ?`;
    execBinds.push(DEFAULT_UNPAGINATED_LIMIT);
  }

  const { results } = await db.prepare(sql).bind(...execBinds).all<Record<string, unknown>>();
  const orderIds = results.map((row) => row.id as string);
  const itemsByOrder = await batchOrderItems(db, orderIds);
  const items = results.map((row) =>
    mapListOrderRow(row, itemsByOrder.get(row.id as string) ?? []),
  );

  if (!paginate) return items;

  return {
    items,
    total,
    summary: { totalSales, totalPoints },
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export function getAllowedStatusTargets(actor: SessionUser, currentStatus: string): OrderStatus[] {
  const from = normalizeLegacyStatus(currentStatus);
  if (from === "rejected" || from === "cancelled") return [];

  if (actor.role === "master_admin") {
    return ORDER_STATUSES.filter((s) => s !== from && s !== "rejected");
  }

  const targets: OrderStatus[] = [];
  const candidates: OrderStatus[] = ["approved", "in_making", "out_for_delivery", "delivered"];
  for (const to of candidates) {
    try {
      assertStatusUpdate(actor, from, to);
      targets.push(to);
    } catch {
      // not allowed
    }
  }
  return targets;
}

export type OrderStatusCounts = {
  pending: number;
  approved: number;
  in_making: number;
  out_for_delivery: number;
  delivered: number;
  rejected: number;
  cancelled: number;
  all: number;
};

export async function getOrderStatusCounts(
  db: D1Database,
  opts: Pick<ListOrdersOptions, "dealerIds" | "distributorId" | "salesExecutiveUserId">,
): Promise<OrderStatusCounts> {
  const { clause, binds } = buildOrdersWhereClause(opts);
  const { results } = await db
    .prepare(
      `SELECT o.status, COUNT(*) as c ${ORDER_LIST_FROM} ${clause} GROUP BY o.status`,
    )
    .bind(...binds)
    .all<{ status: string; c: number }>();

  const counts: OrderStatusCounts = {
    pending: 0,
    approved: 0,
    in_making: 0,
    out_for_delivery: 0,
    delivered: 0,
    rejected: 0,
    cancelled: 0,
    all: 0,
  };

  for (const row of results) {
    const n = row.c ?? 0;
    counts.all += n;
    const status = normalizeLegacyStatus(row.status);
    if (status === "order_placed" || status === "pending_approval") counts.pending += n;
    else if (status === "approved") counts.approved += n;
    else if (status === "in_making" || status === "in_production") counts.in_making += n;
    else if (status === "out_for_delivery") counts.out_for_delivery += n;
    else if (status === "delivered") counts.delivered += n;
    else if (status === "rejected") counts.rejected += n;
    else if (status === "cancelled") counts.cancelled += n;
  }

  return counts;
}

export async function updateOrderLineItems(
  db: D1Database,
  orderId: string,
  user: { id: string; dealerId?: string },
  input: {
    productId: string;
    quantity: number;
    thickness?: string;
    sizeRequested?: string;
    sizeStandard?: string;
    lengthIn?: number;
    breadthIn?: number;
    campaignId?: string;
    notes?: string;
  },
) {
  const order = await db
    .prepare(`SELECT * FROM orders WHERE id = ? AND deleted_at IS NULL`)
    .bind(orderId)
    .first<{ id: string; dealer_id: string; status: string }>();
  if (!order) throw new Error("Order not found");
  if (user.dealerId && order.dealer_id !== user.dealerId) throw new Error("Forbidden");
  const status = normalizeLegacyStatus(order.status);
  if (status !== "order_placed" && status !== "pending_approval") {
    throw new Error("This order can no longer be changed. Contact your distributor for help.");
  }

  const quote = await buildPriceQuote(db, {
    productId: input.productId,
    quantity: input.quantity,
    thickness: input.thickness,
    campaignId: input.campaignId,
    lengthIn: input.lengthIn,
    breadthIn: input.breadthIn,
    dealerId: order.dealer_id,
  });

  const standardDims = pricingDimensions(input.lengthIn, input.breadthIn);
  const sizeStandard =
    standardDims.lengthIn && standardDims.breadthIn
      ? `${standardDims.lengthIn}" × ${standardDims.breadthIn}"`
      : input.sizeStandard ?? null;

  const item = await db
    .prepare(`SELECT id FROM order_items WHERE order_id = ? LIMIT 1`)
    .bind(orderId)
    .first<{ id: string }>();
  if (!item) throw new Error("Order item not found");

  await db
    .prepare(
      `UPDATE order_items SET product_id = ?, product_name = ?, size_requested = ?, size_standard = ?, thickness = ?,
        quantity = ?, mrp = ?, dealer_price = ?, dealer_margin_percent = ?, distributor_price = ?,
        distributor_margin_percent = ?, campaign_id = ?, campaign_price = ?, discount_percent = ?,
        points_earned = ?, line_total = ?, notes = COALESCE(?, notes)
       WHERE id = ?`,
    )
    .bind(
      quote.productId,
      quote.productName,
      input.sizeRequested ?? null,
      sizeStandard,
      input.thickness ?? null,
      input.quantity,
      quote.mrp,
      quote.dealerPrice,
      quote.dealerMarginPercent,
      quote.distributorPrice,
      quote.distributorMarginPercent,
      quote.campaignId,
      quote.campaignPrice,
      quote.discountPercent,
      quote.pointsEarned,
      quote.lineTotal,
      input.notes ?? null,
      item.id,
    )
    .run();

  await db
    .prepare(
      `UPDATE orders SET total_items = ?, total_value = ?, notes = COALESCE(?, notes), updated_at = ? WHERE id = ?`,
    )
    .bind(input.quantity, quote.lineTotal, input.notes ?? null, nowIso(), orderId)
    .run();

  return getOrderById(db, orderId);
}
