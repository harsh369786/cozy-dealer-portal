import { formatInLabel, id, nowIso } from "../utils";
import type { SessionUser } from "../types";
import {
  assertStatusUpdate,
  canRoleSetStatus,
  normalizeLegacyStatus,
  ORDER_STATUS_LABELS,
  type OrderStatus,
} from "../order-status";
import { buildPriceQuote, calculateRewardPoints } from "./pricing";
import { enqueueWhatsapp } from "./whatsapp";
import { createNotification } from "./notifications";

type CreateOrderInput = {
  productId: string;
  quantity: number;
  thickness?: string;
  sizeRequested?: string;
  sizeStandard?: string;
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

async function notifyMasterAdmins(
  db: D1Database,
  input: { title: string; body: string; link: string },
) {
  const { results } = await db
    .prepare(`SELECT id FROM users WHERE role = 'master_admin' AND status = 'active'`)
    .all<{ id: string }>();
  for (const u of results) {
    await createNotification(db, {
      recipientUserId: u.id,
      category: "orders",
      type: "new_order",
      title: input.title,
      body: input.body,
      link: input.link,
    });
  }
}

async function notifyAdminStaff(
  db: D1Database,
  input: { title: string; body: string; link: string },
) {
  const { results } = await db
    .prepare(`SELECT id FROM users WHERE role = 'admin_staff' AND status = 'active'`)
    .all<{ id: string }>();
  for (const u of results) {
    await createNotification(db, {
      recipientUserId: u.id,
      category: "orders",
      type: "new_order",
      title: input.title,
      body: input.body,
      link: input.link,
    });
  }
}

async function notifyDistributors(
  db: D1Database,
  distributorId: string,
  input: { title: string; body: string; link: string; type?: string },
) {
  const { results } = await db
    .prepare(`SELECT id FROM users WHERE distributor_id = ? AND role = 'distributor' AND status = 'active'`)
    .bind(distributorId)
    .all<{ id: string }>();
  for (const u of results) {
    await createNotification(db, {
      recipientUserId: u.id,
      category: "orders",
      type: input.type ?? "new_order",
      title: input.title,
      body: input.body,
      link: input.link,
    });
  }
}

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
  });

  const orderId = `BR-${Date.now().toString().slice(-5)}`;
  const placedAt = nowIso();

  await db
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
    )
    .run();

  const itemId = id("oi");
  await db
    .prepare(
      `INSERT INTO order_items (id, order_id, product_id, product_name, size_requested, size_standard, thickness,
        quantity, perma, perma_corners, perma_notes, mrp, dealer_price, campaign_id, campaign_price, discount_percent,
        free_items, points_earned, line_total, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      itemId,
      orderId,
      quote.productId,
      quote.productName,
      input.sizeRequested ?? null,
      input.sizeStandard ?? null,
      input.thickness ?? null,
      input.quantity,
      input.perma ? 1 : 0,
      input.permaCorners ?? null,
      input.permaNotes ?? null,
      quote.mrp,
      quote.dealerPrice,
      quote.campaignId,
      quote.campaignPrice,
      quote.discountPercent,
      quote.freeItems,
      quote.pointsEarned,
      quote.lineTotal,
      input.notes ?? null,
    )
    .run();

  await addTimelineEvent(db, orderId, "order_placed", ORDER_STATUS_LABELS.order_placed, user.id);

  await notifyDistributors(db, dealer.distributor_id, {
    title: "New order placed",
    body: `${dealer.store_name} placed order ${orderId}`,
    link: `/distributor/orders/${orderId}`,
  });

  await notifyMasterAdmins(db, {
    title: "New order placed",
    body: `${dealer.store_name} placed order ${orderId}`,
    link: `/admin/orders/${orderId}`,
  });

  await notifyAdminStaff(db, {
    title: "New order placed",
    body: `${dealer.store_name} placed order ${orderId}`,
    link: `/admin/orders/${orderId}`,
  });

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

  const setClause = Object.keys(updates)
    .map((k) => `${k} = ?`)
    .concat("status = ?")
    .join(", ");

  await db
    .prepare(`UPDATE orders SET ${setClause} WHERE id = ?`)
    .bind(...Object.values(updates), toStatus, orderId)
    .run();

  await addTimelineEvent(db, orderId, toStatus, ORDER_STATUS_LABELS[toStatus], actor.id);

  if (toStatus === "delivered") {
    await handleOrderDelivered(db, orderId, env);
  }

  return getOrderById(db, orderId);
}

async function handleOrderDelivered(
  db: D1Database,
  orderId: string,
  env: { WHATSAPP_QUEUE?: Queue },
) {
  const order = await db
    .prepare(`SELECT * FROM orders WHERE id = ?`)
    .bind(orderId)
    .first<Record<string, unknown>>();
  if (!order || order.rewards_credited_at) return;

  const items = await db
    .prepare(
      `SELECT oi.mrp, oi.quantity, oi.product_id,
        (SELECT reward_percent FROM product_prices pp WHERE pp.product_id = oi.product_id ORDER BY pp.effective_from DESC LIMIT 1) as reward_percent,
        (SELECT reward_eligibility FROM product_prices pp WHERE pp.product_id = oi.product_id ORDER BY pp.effective_from DESC LIMIT 1) as reward_eligibility
       FROM order_items oi WHERE oi.order_id = ?`,
    )
    .bind(orderId)
    .all<{
      mrp: number;
      quantity: number;
      product_id: string;
      reward_percent: number | null;
      reward_eligibility: string | null;
    }>();

  let dealerPoints = 0;
  for (const item of items.results) {
    const pct = item.reward_percent ?? 0;
    const eligibility = item.reward_eligibility ?? "dealer";
    const pts = calculateRewardPoints(item.mrp, pct, item.quantity);
    if (eligibility === "dealer" || eligibility === "both") {
      dealerPoints += pts;
    }
  }

  const creditedAt = nowIso();
  if (dealerPoints > 0) {
    const dealerId = order.dealer_id as string;
    const last = await db
      .prepare(`SELECT balance_after FROM points_ledger WHERE dealer_id = ? ORDER BY occurred_at DESC LIMIT 1`)
      .bind(dealerId)
      .first<{ balance_after: number }>();
    const balance = (last?.balance_after ?? 0) + dealerPoints;
    await db
      .prepare(
        `INSERT INTO points_ledger (id, dealer_id, delta, balance_after, label, reference_type, reference_id, occurred_at)
         VALUES (?, ?, ?, ?, ?, 'order', ?, ?)`,
      )
      .bind(
        id("pl"),
        dealerId,
        dealerPoints,
        balance,
        `Order ${orderId} delivered`,
        orderId,
        creditedAt,
      )
      .run();
  }

  await db
    .prepare(`UPDATE orders SET rewards_credited_at = ? WHERE id = ?`)
    .bind(creditedAt, orderId)
    .run();

  const fullOrder = await getOrderById(db, orderId);
  const dealer = await db
    .prepare(`SELECT phone, store_name FROM dealers WHERE id = ?`)
    .bind(order.dealer_id)
    .first<{ phone: string; store_name: string }>();

  if (dealer && fullOrder) {
    await enqueueWhatsapp(db, env, {
      toPhone: dealer.phone,
      templateKey: "order_delivered",
      payload: buildOrderWhatsappPayload(orderId, fullOrder),
    });
  }

  await notifyDistributors(db, order.distributor_id as string, {
    title: "Order delivered",
    body: `Order ${orderId} for ${dealer?.store_name ?? "dealer"} has been delivered`,
    link: `/distributor/orders/${orderId}`,
    type: "order_approved",
  });

  await notifyMasterAdmins(db, {
    title: "Order delivered",
    body: `Order ${orderId} has been marked delivered`,
    link: `/admin/orders/${orderId}`,
  });
}

export async function getOrderById(db: D1Database, orderId: string) {
  const order = await db
    .prepare(
      `SELECT o.*, d.store_name as dealer_name, d.code as dealer_code, d.address as dealer_address, d.contact_name,
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
    items: items.results.map((i) => ({
      model: i.product_name,
      size: i.size_requested ?? i.size_standard ?? "",
      thickness: i.thickness ?? "—",
      quantity: i.quantity,
      farma: Boolean(i.perma),
      farmaDetails: i.perma_notes,
      mrp: i.mrp,
      dealerPrice: i.dealer_price,
      campaignPrice: i.campaign_price,
      freeItems: i.free_items,
      points: i.points_earned,
      notes: i.notes,
    })),
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

  const placeholders = orderIds.map(() => "?").join(",");
  const { results } = await db
    .prepare(`SELECT * FROM order_items WHERE order_id IN (${placeholders}) ORDER BY order_id, id`)
    .bind(...orderIds)
    .all<Record<string, unknown>>();

  for (const item of results) {
    const orderId = item.order_id as string;
    const list = map.get(orderId) ?? [];
    list.push(item);
    map.set(orderId, list);
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
    items: items.map((i) => ({
      model: i.product_name,
      size: i.size_requested ?? i.size_standard ?? "",
      thickness: i.thickness ?? "—",
      quantity: i.quantity,
      farma: Boolean(i.perma),
      farmaDetails: i.perma_notes,
      mrp: i.mrp,
      dealerPrice: i.dealer_price,
      campaignPrice: i.campaign_price,
      freeItems: i.free_items,
      points: i.points_earned,
      notes: i.notes,
    })),
    timeline: [],
  };
}

export type ListOrdersOptions = {
  dealerIds?: string[];
  distributorId?: string;
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
};

export type PaginatedOrders = {
  items: Awaited<ReturnType<typeof mapListOrderRow>>[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export async function listOrders(
  db: D1Database,
  opts: ListOrdersOptions,
): Promise<PaginatedOrders | Awaited<ReturnType<typeof mapListOrderRow>>[]> {
  let sql = `SELECT o.*, d.store_name as dealer_name, d.code as dealer_code, d.address as dealer_address, d.contact_name,
                    dist.name as distributor_name
             FROM orders o
             JOIN dealers d ON d.id = o.dealer_id
             JOIN distributors dist ON dist.id = o.distributor_id
             WHERE o.deleted_at IS NULL`;
  const binds: unknown[] = [];

  if (opts.dealerIds?.length) {
    sql += ` AND o.dealer_id IN (${opts.dealerIds.map(() => "?").join(",")})`;
    binds.push(...opts.dealerIds);
  }
  if (opts.distributorId) {
    sql += ` AND o.distributor_id = ?`;
    binds.push(opts.distributorId);
  }
  if (opts.status) {
    const legacyMap: Record<string, string> = {
      order_placed: "order_placed",
      pending_approval: "order_placed",
    };
    const dbStatus = legacyMap[opts.status] ?? opts.status;
    if (dbStatus === "order_placed") {
      sql += ` AND o.status IN ('order_placed', 'pending_approval')`;
    } else {
      sql += ` AND o.status = ?`;
      binds.push(dbStatus);
    }
  }
  if (opts.search) {
    sql += ` AND (o.id LIKE ? OR d.store_name LIKE ? OR d.code LIKE ?)`;
    const q = `%${opts.search}%`;
    binds.push(q, q, q);
  }

  const paginate = opts.page != null || opts.pageSize != null;
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 50));

  let total = 0;
  if (paginate) {
    const countSql = sql.replace(
      /^SELECT o\.\*, d\.store_name as dealer_name.*?FROM orders o/s,
      "SELECT COUNT(*) as total FROM orders o",
    );
    const countRow = await db
      .prepare(countSql)
      .bind(...binds)
      .first<{ total: number }>();
    total = countRow?.total ?? 0;
    sql += ` ORDER BY o.placed_at DESC LIMIT ? OFFSET ?`;
    binds.push(pageSize, (page - 1) * pageSize);
  } else {
    sql += ` ORDER BY o.placed_at DESC`;
  }

  const { results } = await db.prepare(sql).bind(...binds).all<Record<string, unknown>>();
  const orderIds = results.map((row) => row.id as string);
  const itemsByOrder = await batchOrderItems(db, orderIds);
  const items = results.map((row) =>
    mapListOrderRow(row, itemsByOrder.get(row.id as string) ?? []),
  );

  if (!paginate) return items;

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export function getAllowedStatusTargets(actor: SessionUser, currentStatus: string): OrderStatus[] {
  const from = normalizeLegacyStatus(currentStatus);
  const targets: OrderStatus[] = [];
  const candidates: OrderStatus[] = ["approved", "in_making", "out_for_delivery", "delivered"];
  for (const to of candidates) {
    try {
      assertStatusUpdate(actor as import("../types").SessionUser, from, to);
      targets.push(to);
    } catch {
      // not allowed
    }
  }
  return targets;
}
