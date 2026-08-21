import { Hono } from "hono";
import { cors } from "hono/cors";
import type { ApiEnv, AppVariables } from "./types";
import { getDatabase } from "./db/get-db";
import {
  requireAuth,
  requireActiveAccount,
  requirePermission,
  setSessionCookie,
  clearSessionCookie,
} from "./middleware/auth";
import { buildSessionUser } from "./rbac";
import { id, nowIso, SESSION_DAYS, sha256 } from "./utils";
import { requestOtp, verifyOtp } from "./services/otp";
import { buildPriceQuote } from "./services/pricing";
import {
  createOrder,
  approveOrder,
  rejectOrder,
  cancelApprovedOrder,
  getOrderById,
  listOrders,
  updateOrderStatus,
  getAllowedStatusTargets,
} from "./services/orders";
import {
  getAssignedDealerIds,
  canAccessDealer,
  canAccessOrder,
  canAccessComplaint,
  dealerIdsInClause,
  resolveReportScope,
  appendDealerScopeSql,
} from "./services/scope";
import {
  notifyAdminStaff,
  notifyDealerUsers,
  notifyDistributorsForOrg,
  notifyMasterAdmins,
} from "./services/notification-events";
import { listNotifications } from "./services/notifications";
import { enqueueWhatsapp, processWhatsappOutbox, scanPendingOrderReminders } from "./services/whatsapp";
import {
  bulkUpdateAssignments,
  getAssignmentOptions,
  getAssignmentSummary,
  listAssignmentRows,
  updateDealerAssignment,
} from "./services/assignments";
import {
  createAdminUser,
  getAdminUser,
  listAdminUsers,
  softDeleteAdminUser,
  updateAdminUser,
} from "./services/users";
import {
  archiveAdminProduct,
  createAdminProduct,
  getAdminProduct,
  listAdminProducts,
  restoreAdminProduct,
  updateAdminProduct,
} from "./services/products-admin";
import {
  activateAdminCampaign,
  archiveAdminCampaign,
  createPriceCampaign,
  getAdminCampaign,
  listAdminCampaigns,
  updatePriceCampaign,
} from "./services/campaigns-admin";
import { createSignupApplication } from "./services/signup";
import { listSignupApplications, reviewSignupApplication } from "./services/signup-review";

const app = new Hono<{ Bindings: ApiEnv; Variables: AppVariables }>();

app.onError((err, c) => {
  const message = err instanceof Error ? err.message : "Request failed";
  const status =
    message.includes("Unauthorized") || message.includes("Invalid OTP") || message.includes("OTP")
      ? 400
      : message.includes("Forbidden")
        ? 403
        : message.includes("not registered") || message.includes("not found")
          ? 400
          : 500;
  if (status >= 500) console.error(err);
  return c.json({ error: message }, status);
});

app.use("/api/v1/*", cors({ origin: "*", credentials: true }));

app.get("/api/v1/health", (c) => c.json({ ok: true }));

// Auth
app.post("/api/v1/auth/otp/request", async (c) => {
  const body = await c.req.json<{ phone: string }>();
  const db = await getDatabase(c.env);
  const result = await requestOtp(db, body.phone, c.env.ENVIRONMENT);
  return c.json(result);
});

app.post("/api/v1/auth/otp/verify", async (c) => {
  const body = await c.req.json<{ phone: string; code: string }>();
  const db = await getDatabase(c.env);
  const userRow = await verifyOtp(db, body.phone, body.code);
  const sessionId = id("sess");
  const tokenHash = await sha256(sessionId);
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  await db
    .prepare(
      `INSERT INTO sessions (id, user_id, token_hash, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(sessionId, userRow.id, tokenHash, expires, c.req.header("cf-connecting-ip") ?? null, c.req.header("user-agent") ?? null)
    .run();

  const user = buildSessionUser({
    id: userRow.id as string,
    name: userRow.name as string,
    phone: userRow.phone as string,
    role: userRow.role as AppVariables["user"]["role"],
    status: userRow.status as AppVariables["user"]["status"],
    dealer_id: userRow.dealer_id as string | null,
    distributor_id: userRow.distributor_id as string | null,
  });

  return c.json({ user }, 200, { "Set-Cookie": setSessionCookie(sessionId) });
});

app.post("/api/v1/auth/logout", requireAuth, async (c) => {
  const db = await getDatabase(c.env);
  await db.prepare(`DELETE FROM sessions WHERE id = ?`).bind(c.get("sessionId")).run();
  return c.json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie() });
});

app.get("/api/v1/auth/me", requireAuth, (c) => c.json({ user: c.get("user") }));

// Catalog
app.get("/api/v1/catalog", requireAuth, requireActiveAccount, requirePermission("catalog:read"), async (c) => {
  const db = await getDatabase(c.env);
  const layers = await db.prepare(`SELECT * FROM product_layers ORDER BY sort_order`).all();
  const layerItems = await db.prepare(`SELECT * FROM product_layer_items ORDER BY sort_order`).all();
  const products = await db
    .prepare(`SELECT * FROM products WHERE deleted_at IS NULL AND active = 1 ORDER BY sort_order`)
    .all();

  const mattressLayers = layers.results.map((layer) => {
    const items = layerItems.results.filter((i) => i.layer_id === layer.id);
    const subgroups = [...new Set(items.map((i) => i.subgroup_label).filter(Boolean))];
    if (subgroups.length) {
      return {
        id: layer.id,
        title: layer.title,
        subgroups: subgroups.map((label) => ({
          label,
          productIds: items.filter((i) => i.subgroup_label === label).map((i) => i.product_id),
        })),
      };
    }
    return {
      id: layer.id,
      title: layer.title,
      productIds: items.map((i) => i.product_id),
    };
  });

  const foldable = products.results.filter((p) => p.category === "Foldable");
  const pillowProducts = products.results.filter((p) => p.category === "Pillows");

  return c.json({ mattressLayers, foldable, pillows: pillowProducts, products: products.results });
});

app.get("/api/v1/catalog/products/:id", requireAuth, requireActiveAccount, requirePermission("catalog:read"), async (c) => {
  const db = await getDatabase(c.env);
  const productId = c.req.param("id");
  const product = await db.prepare(`SELECT * FROM products WHERE id = ?`).bind(productId).first();
  if (!product) return c.json({ error: "Not found" }, 404);

  const thicknesses = await db
    .prepare(`SELECT thickness FROM product_thicknesses WHERE product_id = ? ORDER BY sort_order`)
    .bind(productId)
    .all();
  const price = await db
    .prepare(`SELECT * FROM product_prices WHERE product_id = ? ORDER BY effective_from DESC LIMIT 1`)
    .bind(productId)
    .first();
  const quote = await buildPriceQuote(db, { productId, quantity: 1 });

  return c.json({
    ...product,
    thicknesses: thicknesses.results.map((t) => t.thickness),
    mrp: price?.mrp,
    price: price?.dealer_price,
    points: price?.points,
    free: price?.free_items_label,
    campaign: quote.campaign,
    unitPrice: quote.unitPrice,
  });
});

app.post("/api/v1/catalog/price-quote", requireAuth, requireActiveAccount, requirePermission("catalog:read"), async (c) => {
  const body = await c.req.json<{ productId: string; quantity: number; thickness?: string }>();
  const db = await getDatabase(c.env);
  const quote = await buildPriceQuote(db, body);
  return c.json(quote);
});

// Orders
app.post("/api/v1/orders", requireAuth, requireActiveAccount, requirePermission("orders:create"), async (c) => {
  const db = await getDatabase(c.env);
  const body = await c.req.json();
  const order = await createOrder(db, c.get("user"), body, c.env);
  return c.json(order, 201);
});

app.get("/api/v1/orders", requireAuth, requireActiveAccount, requirePermission("orders:read"), async (c) => {
  const db = await getDatabase(c.env);
  const user = c.get("user");
  const search = c.req.query("search");
  const status = c.req.query("status");
  const page = c.req.query("page");
  const pageSize = c.req.query("pageSize");

  const opts = {
    status,
    search,
    page: page ? Number(page) : undefined,
    pageSize: pageSize ? Number(pageSize) : undefined,
  };

  const scope = await getAssignedDealerIds(db, user);
  if (scope === "all") {
    return c.json(await listOrders(db, opts));
  }
  if (!scope.length) {
    if (page || pageSize) {
      return c.json({ items: [], total: 0, page: 1, pageSize: Number(pageSize) || 50, totalPages: 1 });
    }
    return c.json([]);
  }
  return c.json(await listOrders(db, { ...opts, dealerIds: scope }));
});

app.get("/api/v1/orders/:id", requireAuth, requireActiveAccount, requirePermission("orders:read"), async (c) => {
  const db = await getDatabase(c.env);
  const orderId = c.req.param("id");
  if (!(await canAccessOrder(db, c.get("user"), orderId))) return c.json({ error: "Forbidden" }, 403);
  const order = await getOrderById(db, orderId);
  if (!order) return c.json({ error: "Not found" }, 404);
  return c.json(order);
});

app.post("/api/v1/orders/:id/approve", requireAuth, requireActiveAccount, requirePermission("orders:approve"), async (c) => {
  const db = await getDatabase(c.env);
  const orderId = c.req.param("id");
  if (!(await canAccessOrder(db, c.get("user"), orderId))) return c.json({ error: "Forbidden" }, 403);
  const order = await approveOrder(db, orderId, c.get("user"), c.env);
  return c.json(order);
});

app.patch("/api/v1/orders/:id/status", requireAuth, requireActiveAccount, async (c) => {
  const db = await getDatabase(c.env);
  const orderId = c.req.param("id");
  const body = await c.req.json<{ status: string }>();
  if (!(await canAccessOrder(db, c.get("user"), orderId))) return c.json({ error: "Forbidden" }, 403);
  const user = c.get("user");
  const status = body.status as import("./order-status").OrderStatus;

  const fulfillmentStatuses: import("./order-status").OrderStatus[] = [
    "in_making",
    "out_for_delivery",
    "delivered",
  ];
  if (status === "approved") {
    if (!user.permissions.includes("orders:approve")) return c.json({ error: "Forbidden" }, 403);
  } else if (fulfillmentStatuses.includes(status)) {
    if (!user.permissions.includes("orders:status:fulfillment")) {
      return c.json({ error: "Forbidden" }, 403);
    }
  } else {
    return c.json({ error: "Forbidden" }, 403);
  }

  const order = await updateOrderStatus(db, orderId, status, user, c.env);
  return c.json(order);
});

app.get("/api/v1/orders/:id/status-options", requireAuth, requireActiveAccount, requirePermission("orders:read"), async (c) => {
  const db = await getDatabase(c.env);
  const orderId = c.req.param("id");
  if (!(await canAccessOrder(db, c.get("user"), orderId))) return c.json({ error: "Forbidden" }, 403);
  const row = await db.prepare(`SELECT status FROM orders WHERE id = ?`).bind(orderId).first<{ status: string }>();
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ allowed: getAllowedStatusTargets(c.get("user"), row.status) });
});

app.post("/api/v1/orders/:id/reject", requireAuth, requireActiveAccount, requirePermission("orders:reject"), async (c) => {
  const db = await getDatabase(c.env);
  const orderId = c.req.param("id");
  const body = await c.req.json<{ reason: string }>();
  if (!body.reason?.trim()) return c.json({ error: "Reason required" }, 400);
  if (!(await canAccessOrder(db, c.get("user"), orderId))) return c.json({ error: "Forbidden" }, 403);
  const order = await rejectOrder(db, orderId, body.reason.trim(), c.get("user"), c.env);
  return c.json(order);
});

app.post("/api/v1/orders/:id/cancel", requireAuth, requireActiveAccount, requirePermission("orders:cancel"), async (c) => {
  const db = await getDatabase(c.env);
  const orderId = c.req.param("id");
  const body = await c.req.json<{ reason?: string }>().catch(() => ({ reason: undefined }));
  if (!(await canAccessOrder(db, c.get("user"), orderId))) return c.json({ error: "Forbidden" }, 403);
  const order = await cancelApprovedOrder(db, orderId, c.get("user"), body.reason);
  return c.json(order);
});

app.get("/api/v1/dealers/:id/orders", requireAuth, requireActiveAccount, requirePermission("orders:read"), async (c) => {
  const db = await getDatabase(c.env);
  const dealerId = c.req.param("id");
  if (!(await canAccessDealer(db, c.get("user"), dealerId))) return c.json({ error: "Forbidden" }, 403);
  return c.json(await listOrders(db, { dealerIds: [dealerId] }));
});

// Dealers
app.get("/api/v1/dealers", requireAuth, requireActiveAccount, requirePermission("dealers:read"), async (c) => {
  const db = await getDatabase(c.env);
  const user = c.get("user");
  const search = c.req.query("search");
  const scope = await getAssignedDealerIds(db, user);

  let sql = `SELECT * FROM dealers WHERE deleted_at IS NULL`;
  const binds: unknown[] = [];
  if (scope !== "all") {
    if (!scope.length) return c.json([]);
    sql += ` AND id IN (${scope.map(() => "?").join(",")})`;
    binds.push(...scope);
  }
  if (search) {
    sql += ` AND (store_name LIKE ? OR code LIKE ? OR location LIKE ?)`;
    const q = `%${search}%`;
    binds.push(q, q, q);
  }
  const { results } = await db.prepare(sql).bind(...binds).all();
  return c.json(results.map(mapDealerRow));
});

app.get("/api/v1/dealers/:id", requireAuth, requireActiveAccount, requirePermission("dealers:read"), async (c) => {
  const db = await getDatabase(c.env);
  const dealerId = c.req.param("id");
  if (!(await canAccessDealer(db, c.get("user"), dealerId))) return c.json({ error: "Forbidden" }, 403);
  const row = await db.prepare(`SELECT * FROM dealers WHERE id = ?`).bind(dealerId).first();
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(mapDealerRow(row));
});

app.get("/api/v1/dealers/:id/performance", requireAuth, requireActiveAccount, requirePermission("dealers:read"), async (c) => {
  const db = await getDatabase(c.env);
  const dealerId = c.req.param("id");
  if (!(await canAccessDealer(db, c.get("user"), dealerId))) return c.json({ error: "Forbidden" }, 403);
  const { results } = await db
    .prepare(
      `SELECT strftime('%Y-%m', placed_at) as month, COUNT(*) as orders, SUM(total_value) as orderValue
       FROM orders WHERE dealer_id = ? AND deleted_at IS NULL GROUP BY month ORDER BY month DESC LIMIT 6`,
    )
    .bind(dealerId)
    .all();
  return c.json(results);
});

app.get("/api/v1/dealers/:id/reward-claims", requireAuth, requireActiveAccount, requirePermission("rewards:read"), async (c) => {
  const db = await getDatabase(c.env);
  const dealerId = c.req.param("id");
  if (!(await canAccessDealer(db, c.get("user"), dealerId))) return c.json({ error: "Forbidden" }, 403);
  const { results } = await db
    .prepare(`SELECT * FROM reward_claims WHERE dealer_id = ? ORDER BY claimed_at DESC`)
    .bind(dealerId)
    .all();
  return c.json(
    results.map((r) => ({
      id: r.id,
      dealerId: r.dealer_id,
      name: r.name,
      emoji: r.emoji,
      points: r.points_spent,
      claimedAt: r.claimed_at,
      status: r.status,
      deliveredAt: r.delivered_at,
    })),
  );
});

// Campaigns
app.get("/api/v1/campaigns", requireAuth, requireActiveAccount, requirePermission("campaigns:read"), async (c) => {
  const db = await getDatabase(c.env);
  const tab = c.req.query("tab") ?? "active";
  const sell = await db.prepare(`SELECT * FROM sell_campaigns WHERE deleted_at IS NULL`).all();
  const filtered = sell.results.filter((c) => c.status === tab);
  return c.json(
    filtered.map((c) => ({
      id: c.id,
      title: c.title,
      emoji: c.emoji,
      goal: c.goal_text,
      reward: c.reward_text,
      done: c.done_count,
      target: c.target_count,
      starts: c.starts_at,
      ends: c.ends_at,
      status: c.status,
    })),
  );
});

app.get("/api/v1/distributor/campaigns", requireAuth, requireActiveAccount, requirePermission("campaigns:read"), async (c) => {
  const db = await getDatabase(c.env);
  const user = c.get("user");
  const tab = c.req.query("tab");
  let sql = `SELECT * FROM distributor_campaigns WHERE deleted_at IS NULL`;
  const binds: unknown[] = [];
  if (user.distributorId) {
    sql += ` AND distributor_id = ?`;
    binds.push(user.distributorId);
  }
  if (tab) {
    sql += ` AND status = ?`;
    binds.push(tab);
  }
  const { results } = await db.prepare(sql).bind(...binds).all();
  return c.json(
    results.map((c) => ({
      id: c.id,
      distributorId: c.distributor_id,
      name: c.name,
      product: c.product_name,
      discountLabel: c.discount_label,
      description: c.description,
      startDate: c.start_date,
      endDate: c.end_date,
      status: c.status,
      bannerEmoji: c.banner_emoji,
    })),
  );
});

// Rewards
app.get("/api/v1/rewards/catalog", requireAuth, requireActiveAccount, requirePermission("rewards:read"), async (c) => {
  const db = await getDatabase(c.env);
  const { results } = await db
    .prepare(`SELECT * FROM reward_catalog WHERE deleted_at IS NULL AND active = 1`)
    .all();
  return c.json(results.map((r) => ({ id: r.id, name: r.name, emoji: r.emoji, points: r.points_required })));
});

app.get("/api/v1/rewards/balance", requireAuth, requireActiveAccount, requirePermission("rewards:read"), async (c) => {
  const db = await getDatabase(c.env);
  const user = c.get("user");
  if (!user.dealerId) return c.json({ balance: 0, nextRewardAt: 3000 });
  const last = await db
    .prepare(`SELECT balance_after FROM points_ledger WHERE dealer_id = ? ORDER BY occurred_at DESC LIMIT 1`)
    .bind(user.dealerId)
    .first<{ balance_after: number }>();
  const next = await db
    .prepare(`SELECT points_required FROM reward_catalog WHERE active = 1 ORDER BY points_required ASC LIMIT 1`)
    .first<{ points_required: number }>();
  return c.json({ balance: last?.balance_after ?? 0, nextRewardAt: next?.points_required ?? 3000 });
});

app.get("/api/v1/rewards/ledger", requireAuth, requireActiveAccount, requirePermission("rewards:read"), async (c) => {
  const db = await getDatabase(c.env);
  const user = c.get("user");
  if (!user.dealerId) return c.json([]);
  const { results } = await db
    .prepare(`SELECT label, delta as value, occurred_at as date FROM points_ledger WHERE dealer_id = ? ORDER BY occurred_at DESC LIMIT 50`)
    .bind(user.dealerId)
    .all();
  return c.json(results);
});

app.get("/api/v1/rewards/claims", requireAuth, requireActiveAccount, requirePermission("rewards:read"), async (c) => {
  const db = await getDatabase(c.env);
  const user = c.get("user");
  if (!user.dealerId) return c.json([]);
  const { results } = await db
    .prepare(`SELECT * FROM reward_claims WHERE dealer_id = ? ORDER BY claimed_at DESC`)
    .bind(user.dealerId)
    .all();
  return c.json(
    results.map((r) => ({
      id: r.id,
      name: r.name,
      emoji: r.emoji,
      claimed: r.claimed_at,
      status: r.status === "delivered" ? "Delivered" : "Pending",
      delivered: r.delivered_at,
    })),
  );
});

app.post("/api/v1/rewards/claims", requireAuth, requireActiveAccount, requirePermission("rewards:redeem"), async (c) => {
  const db = await getDatabase(c.env);
  const user = c.get("user");
  if (!user.dealerId) return c.json({ error: "Dealer required" }, 400);
  const body = await c.req.json<{ rewardId: string }>();
  const reward = await db.prepare(`SELECT * FROM reward_catalog WHERE id = ?`).bind(body.rewardId).first();
  if (!reward) return c.json({ error: "Reward not found" }, 404);

  const last = await db
    .prepare(`SELECT balance_after FROM points_ledger WHERE dealer_id = ? ORDER BY occurred_at DESC LIMIT 1`)
    .bind(user.dealerId)
    .first<{ balance_after: number }>();
  const balance = last?.balance_after ?? 0;
  if (balance < reward.points_required) return c.json({ error: "Insufficient points" }, 400);

  const claimId = id("rc");
  const claimedAt = nowIso();
  await db
    .prepare(
      `INSERT INTO reward_claims (id, dealer_id, reward_catalog_id, name, emoji, points_spent, status, claimed_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
    )
    .bind(claimId, user.dealerId, reward.id, reward.name, reward.emoji, reward.points_required, claimedAt)
    .run();

  await db
    .prepare(
      `INSERT INTO points_ledger (id, dealer_id, delta, balance_after, label, reference_type, reference_id, occurred_at)
       VALUES (?, ?, ?, ?, ?, 'reward_claim', ?, ?)`,
    )
    .bind(id("pl"), user.dealerId, -reward.points_required, balance - reward.points_required, reward.name, claimId, claimedAt)
    .run();

  const dealer = await db
    .prepare(`SELECT store_name FROM dealers WHERE id = ?`)
    .bind(user.dealerId)
    .first<{ store_name: string }>();

  await notifyMasterAdmins(db, {
    category: "system",
    type: "system",
    title: "Reward claim submitted",
    body: `${dealer?.store_name ?? "Dealer"} claimed ${reward.name as string} (${reward.points_required} pts)`,
    link: "/admin/rewards/claims",
  });

  return c.json({ id: claimId, status: "pending" }, 201);
});

// Complaints
app.post("/api/v1/complaints", requireAuth, requireActiveAccount, requirePermission("complaints:create"), async (c) => {
  const db = await getDatabase(c.env);
  const body = await c.req.json<{ orderId: string; description: string; category?: string }>();
  const user = c.get("user");
  if (!user.dealerId) return c.json({ error: "Dealer required" }, 400);

  const order = await db
    .prepare(`SELECT dealer_id, distributor_id FROM orders WHERE id = ?`)
    .bind(body.orderId)
    .first<{ dealer_id: string; distributor_id: string }>();
  if (!order || order.dealer_id !== user.dealerId) return c.json({ error: "Order not found" }, 404);

  const complaintId = id("cmp");
  const ts = nowIso();
  await db
    .prepare(
      `INSERT INTO complaints (id, order_id, dealer_id, distributor_id, category, description, status, step, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?)`,
    )
    .bind(complaintId, body.orderId, user.dealerId, order.distributor_id, body.category ?? "general", body.description, ts, ts)
    .run();

  const dealer = await db
    .prepare(`SELECT store_name FROM dealers WHERE id = ?`)
    .bind(user.dealerId)
    .first<{ store_name: string }>();

  const complaintPayload = {
    category: "complaints" as const,
    type: "complaint_new" as const,
    title: "New complaint",
    body: `${dealer?.store_name ?? "Dealer"} reported an issue on order ${body.orderId}`,
    link: `/admin/complaints/${complaintId}`,
  };

  await notifyDistributorsForOrg(db, order.distributor_id, {
    ...complaintPayload,
    link: `/distributor/complaints/${complaintId}`,
  });
  await notifyMasterAdmins(db, complaintPayload);
  await notifyAdminStaff(db, complaintPayload);

  return c.json({ id: complaintId }, 201);
});

app.get("/api/v1/complaints", requireAuth, requireActiveAccount, requirePermission("complaints:read"), async (c) => {
  const db = await getDatabase(c.env);
  const user = c.get("user");
  let sql = `SELECT c.*, d.store_name as dealer_name FROM complaints c JOIN dealers d ON d.id = c.dealer_id WHERE c.deleted_at IS NULL`;
  const binds: unknown[] = [];

  const scope = await getAssignedDealerIds(db, user);
  if (scope !== "all") {
    if (!scope.length) return c.json([]);
    const clause = dealerIdsInClause(scope, "c.dealer_id");
    sql += clause.sql;
    binds.push(...clause.binds);
  }

  const { results } = await db.prepare(sql).bind(...binds).all();
  return c.json(
    results.map((c) => ({
      id: c.id,
      orderId: c.order_id,
      dealerId: c.dealer_id,
      dealerName: c.dealer_name,
      category: c.category,
      description: c.description,
      status: c.status,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    })),
  );
});

app.patch("/api/v1/complaints/:id", requireAuth, requireActiveAccount, requirePermission("complaints:update"), async (c) => {
  const db = await getDatabase(c.env);
  const user = c.get("user");
  if (user.role !== "master_admin") return c.json({ error: "Forbidden" }, 403);
  const complaintId = c.req.param("id");
  if (!(await canAccessComplaint(db, user, complaintId))) return c.json({ error: "Forbidden" }, 403);
  const body = await c.req.json<{ status: string }>();
  const complaint = await db
    .prepare(`SELECT dealer_id, order_id FROM complaints WHERE id = ?`)
    .bind(complaintId)
    .first<{ dealer_id: string; order_id: string }>();
  if (!complaint) return c.json({ error: "Not found" }, 404);

  await db
    .prepare(`UPDATE complaints SET status = ?, updated_at = ? WHERE id = ?`)
    .bind(body.status, nowIso(), complaintId)
    .run();

  await notifyDealerUsers(db, complaint.dealer_id, {
    category: "complaints",
    type: "complaint_update",
    title: "Complaint updated",
    body: `Your complaint on order ${complaint.order_id} is now ${body.status.replace(/_/g, " ")}`,
    link: `/complaints/${complaintId}`,
  });

  return c.json({ ok: true });
});

// Notifications
app.get("/api/v1/notifications", requireAuth, requireActiveAccount, requirePermission("notifications:read"), async (c) => {
  const db = await getDatabase(c.env);
  return c.json(await listNotifications(db, c.get("user").id));
});

app.patch("/api/v1/notifications/:id/read", requireAuth, requireActiveAccount, requirePermission("notifications:read"), async (c) => {
  const db = await getDatabase(c.env);
  await db.prepare(`UPDATE notifications SET read = 1 WHERE id = ? AND recipient_user_id = ?`).bind(c.req.param("id"), c.get("user").id).run();
  return c.json({ ok: true });
});

app.post("/api/v1/notifications/read-all", requireAuth, requireActiveAccount, requirePermission("notifications:read"), async (c) => {
  const db = await getDatabase(c.env);
  await db.prepare(`UPDATE notifications SET read = 1 WHERE recipient_user_id = ?`).bind(c.get("user").id).run();
  return c.json({ ok: true });
});

// Reports
app.get("/api/v1/reports/dashboard", requireAuth, requireActiveAccount, requirePermission("reports:read"), async (c) => {
  const db = await getDatabase(c.env);
  const user = c.get("user");
  const reportScope = await resolveReportScope(db, user);
  if (!reportScope.allowed) return c.json({ error: "Forbidden" }, 403);

  const dealerBinds: unknown[] = [];
  const dealerFilter = appendDealerScopeSql(reportScope.dealerIds, "id", dealerBinds);

  const dealers = await db
    .prepare(`SELECT COUNT(*) as c FROM dealers WHERE deleted_at IS NULL${dealerFilter}`)
    .bind(...dealerBinds)
    .first<{ c: number }>();

  const activeBinds: unknown[] = [];
  const activeFilter = appendDealerScopeSql(reportScope.dealerIds, "id", activeBinds);
  const active = await db
    .prepare(`SELECT COUNT(*) as c FROM dealers WHERE deleted_at IS NULL AND active = 1${activeFilter}`)
    .bind(...activeBinds)
    .first<{ c: number }>();

  const orderBinds: unknown[] = [];
  const orderFilter = appendDealerScopeSql(reportScope.dealerIds, "dealer_id", orderBinds);
  const pending = await db
    .prepare(
      `SELECT COUNT(*) as c FROM orders WHERE status IN ('order_placed', 'pending_approval') AND deleted_at IS NULL${orderFilter}`,
    )
    .bind(...orderBinds)
    .first<{ c: number }>();

  const complaintBinds: unknown[] = [];
  const complaintFilter = appendDealerScopeSql(reportScope.dealerIds, "dealer_id", complaintBinds);
  const complaints = await db
    .prepare(
      `SELECT COUNT(*) as c FROM complaints WHERE status IN ('pending','in_progress') AND deleted_at IS NULL${complaintFilter}`,
    )
    .bind(...complaintBinds)
    .first<{ c: number }>();

  return c.json({
    totalDealers: dealers?.c ?? 0,
    activeDealers: active?.c ?? 0,
    ordersThisMonth: 0,
    monthlySales: 0,
    pendingApprovals: pending?.c ?? 0,
    openComplaints: complaints?.c ?? 0,
    rewardPointsGenerated: 0,
    salesGrowth: 0,
    prevMonthSales: 0,
  });
});

app.get("/api/v1/reports/monthly-sales", requireAuth, requireActiveAccount, requirePermission("reports:read"), async (c) => {
  const db = await getDatabase(c.env);
  const user = c.get("user");
  const reportScope = await resolveReportScope(db, user);
  if (!reportScope.allowed) return c.json({ error: "Forbidden" }, 403);

  const binds: unknown[] = [];
  let sql = `SELECT strftime('%b %Y', placed_at) as month, SUM(total_value) as sales, COUNT(*) as orders FROM orders WHERE deleted_at IS NULL`;
  sql += appendDealerScopeSql(reportScope.dealerIds, "dealer_id", binds);
  sql += ` GROUP BY strftime('%Y-%m', placed_at) ORDER BY placed_at DESC LIMIT 6`;
  const { results } = await db.prepare(sql).bind(...binds).all();
  return c.json(results);
});

app.get("/api/v1/reports/product-sales", requireAuth, requireActiveAccount, requirePermission("reports:read"), async (c) => {
  const db = await getDatabase(c.env);
  const user = c.get("user");
  const reportScope = await resolveReportScope(db, user);
  if (!reportScope.allowed) return c.json({ error: "Forbidden" }, 403);

  const binds: unknown[] = [];
  let sql = `SELECT oi.product_name as product, SUM(oi.line_total) as sales, SUM(oi.quantity) as units
       FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.deleted_at IS NULL`;
  sql += appendDealerScopeSql(reportScope.dealerIds, "o.dealer_id", binds);
  sql += ` GROUP BY oi.product_name ORDER BY sales DESC LIMIT 10`;
  const { results } = await db.prepare(sql).bind(...binds).all();
  return c.json(results);
});

// Signup
app.post("/api/v1/signup/applications", async (c) => {
  const db = await getDatabase(c.env);
  const body = await c.req.json();
  try {
    const result = await createSignupApplication(db, {
      name: body.name,
      birthday: body.birthday,
      storeName: body.storeName,
      phone: body.phone,
      address: body.address,
      gstNumber: body.gstNumber ?? null,
      distributorName: body.distributorName,
    });
    return c.json(result, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Signup failed";
    return c.json({ error: message }, 400);
  }
});

// Admin routes
const admin = new Hono<{ Bindings: ApiEnv; Variables: AppVariables }>();
admin.use("*", requireAuth);
admin.use("*", requireActiveAccount);
admin.use("*", async (c, next) => {
  const user = c.get("user");
  if (user.role !== "master_admin" && user.role !== "admin_staff") {
    return c.json({ error: "Forbidden" }, 403);
  }
  await next();
});

admin.get("/users", requirePermission("users:read"), async (c) => {
  const db = await getDatabase(c.env);
  return c.json(
    await listAdminUsers(db, {
      search: c.req.query("search"),
      role: c.req.query("role"),
      status: c.req.query("status"),
      page: Number(c.req.query("page") ?? 1),
      pageSize: Number(c.req.query("pageSize") ?? 20),
    }),
  );
});

admin.get("/users/:id", requirePermission("users:read"), async (c) => {
  const db = await getDatabase(c.env);
  const user = await getAdminUser(db, c.req.param("id"));
  if (!user) return c.json({ error: "User not found" }, 404);
  return c.json(user);
});

admin.post("/users", requirePermission("users:write"), async (c) => {
  const db = await getDatabase(c.env);
  const body = await c.req.json();
  try {
    const user = await createAdminUser(db, body, c.get("user").id);
    return c.json(user, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Create failed";
    return c.json({ error: message }, 400);
  }
});

admin.patch("/users/:id", requirePermission("users:write"), async (c) => {
  const db = await getDatabase(c.env);
  const body = await c.req.json();
  try {
    const user = await updateAdminUser(db, c.req.param("id"), body, c.get("user").id);
    return c.json(user);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    const status = message.includes("not found") ? 404 : 400;
    return c.json({ error: message }, status);
  }
});

admin.delete("/users/:id", requirePermission("users:write"), async (c) => {
  const db = await getDatabase(c.env);
  try {
    return c.json(await softDeleteAdminUser(db, c.req.param("id"), c.get("user").id));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delete failed";
    const status = message.includes("not found") ? 404 : 400;
    return c.json({ error: message }, status);
  }
});

admin.get("/products", requirePermission("catalog:read"), async (c) => {
  const db = await getDatabase(c.env);
  return c.json(
    await listAdminProducts(db, {
      search: c.req.query("search"),
      category: c.req.query("category"),
      status: (c.req.query("status") as "active" | "archived" | "all") ?? "all",
      page: Number(c.req.query("page") ?? 1),
      pageSize: Number(c.req.query("pageSize") ?? 20),
    }),
  );
});

admin.get("/products/:id", requirePermission("catalog:read"), async (c) => {
  const db = await getDatabase(c.env);
  const product = await getAdminProduct(db, c.req.param("id"));
  if (!product) return c.json({ error: "Product not found" }, 404);
  return c.json(product);
});

admin.post("/products", requirePermission("catalog:write"), async (c) => {
  const db = await getDatabase(c.env);
  const body = await c.req.json();
  try {
    const product = await createAdminProduct(db, body, c.get("user").id);
    return c.json(product, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Create failed";
    return c.json({ error: message }, 400);
  }
});

admin.patch("/products/:id", requirePermission("catalog:write"), async (c) => {
  const db = await getDatabase(c.env);
  const body = await c.req.json();
  try {
    const product = await updateAdminProduct(db, c.req.param("id"), body, c.get("user").id);
    return c.json(product);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    const status = message.includes("not found") ? 404 : 400;
    return c.json({ error: message }, status);
  }
});

admin.patch("/products/:id/archive", requirePermission("catalog:write"), async (c) => {
  const db = await getDatabase(c.env);
  try {
    return c.json(await archiveAdminProduct(db, c.req.param("id"), c.get("user").id));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Archive failed";
    return c.json({ error: message }, message.includes("not found") ? 404 : 400);
  }
});

admin.patch("/products/:id/restore", requirePermission("catalog:write"), async (c) => {
  const db = await getDatabase(c.env);
  try {
    return c.json(await restoreAdminProduct(db, c.req.param("id"), c.get("user").id));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Restore failed";
    return c.json({ error: message }, message.includes("not found") ? 404 : 400);
  }
});

admin.get("/campaigns", requirePermission("campaigns:read"), async (c) => {
  const db = await getDatabase(c.env);
  const type = c.req.query("type");
  return c.json(
    await listAdminCampaigns(db, {
      search: c.req.query("search"),
      type:
        type === "price" || type === "sell" || type === "distributor" ? type : "all",
      status: c.req.query("status"),
      active: (c.req.query("active") as "all" | "active" | "inactive") ?? "all",
      page: Number(c.req.query("page") ?? 1),
      pageSize: Number(c.req.query("pageSize") ?? 20),
    }),
  );
});

admin.get("/campaigns/:id", requirePermission("campaigns:read"), async (c) => {
  const db = await getDatabase(c.env);
  const campaign = await getAdminCampaign(db, c.req.param("id"));
  if (!campaign) return c.json({ error: "Campaign not found" }, 404);
  return c.json(campaign);
});

admin.post("/campaigns", requirePermission("campaigns:write"), async (c) => {
  const db = await getDatabase(c.env);
  const body = await c.req.json();
  try {
    const campaign = await createPriceCampaign(db, body, c.get("user").id);
    return c.json(campaign, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Create failed";
    return c.json({ error: message }, 400);
  }
});

admin.patch("/campaigns/:id", requirePermission("campaigns:write"), async (c) => {
  const db = await getDatabase(c.env);
  const body = await c.req.json();
  try {
    const campaign = await updatePriceCampaign(db, c.req.param("id"), body, c.get("user").id);
    return c.json(campaign);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    return c.json({ error: message }, message.includes("not found") ? 404 : 400);
  }
});

admin.patch("/campaigns/:id/archive", requirePermission("campaigns:write"), async (c) => {
  const db = await getDatabase(c.env);
  try {
    return c.json(await archiveAdminCampaign(db, c.req.param("id"), c.get("user").id));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Archive failed";
    return c.json({ error: message }, message.includes("not found") ? 404 : 400);
  }
});

admin.patch("/campaigns/:id/activate", requirePermission("campaigns:write"), async (c) => {
  const db = await getDatabase(c.env);
  try {
    return c.json(await activateAdminCampaign(db, c.req.param("id"), c.get("user").id));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Activate failed";
    return c.json({ error: message }, message.includes("not found") ? 404 : 400);
  }
});

admin.get("/rewards", requirePermission("campaigns:read"), async (c) => {
  const db = await getDatabase(c.env);
  const { results } = await db.prepare(`SELECT * FROM reward_catalog`).all();
  return c.json(results);
});

admin.get("/settings", requirePermission("settings:read"), async (c) => {
  const db = await getDatabase(c.env);
  const { results } = await db.prepare(`SELECT * FROM system_settings`).all();
  return c.json(results);
});

admin.patch("/settings/:key", requirePermission("settings:write"), async (c) => {
  const db = await getDatabase(c.env);
  const body = await c.req.json<{ value: string }>();
  await db
    .prepare(`INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
    .bind(c.req.param("key"), body.value, nowIso())
    .run();
  return c.json({ ok: true });
});

admin.get("/assignments", requirePermission("assignments:read"), async (c) => {
  const db = await getDatabase(c.env);
  const unassigned = c.req.query("unassigned");
  const result = await listAssignmentRows(db, {
    search: c.req.query("search"),
    distributorId: c.req.query("distributorId"),
    salesExecutiveUserId: c.req.query("salesExecutiveUserId"),
    unassigned:
      unassigned === "distributor" || unassigned === "sales_executive" || unassigned === "any"
        ? unassigned
        : undefined,
    page: Number(c.req.query("page") ?? 1),
    pageSize: Number(c.req.query("pageSize") ?? 20),
  });
  return c.json(result);
});

admin.get("/assignments/summary", requirePermission("assignments:read"), async (c) => {
  const db = await getDatabase(c.env);
  return c.json(await getAssignmentSummary(db));
});

admin.get("/assignments/options", requirePermission("assignments:read"), async (c) => {
  const db = await getDatabase(c.env);
  return c.json(await getAssignmentOptions(db));
});

admin.patch("/assignments/dealers/:dealerId", requirePermission("assignments:write"), async (c) => {
  const db = await getDatabase(c.env);
  const body = await c.req.json<{
    distributorId?: string | null;
    salesExecutiveUserId?: string | null;
  }>();
  try {
    const row = await updateDealerAssignment(db, c.req.param("dealerId"), body, c.get("user").id);
    return c.json(row);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    const status = message.includes("not found") ? 404 : 400;
    return c.json({ error: message }, status);
  }
});

admin.post("/assignments/bulk", requirePermission("assignments:write"), async (c) => {
  const db = await getDatabase(c.env);
  const body = await c.req.json<{
    dealerIds: string[];
    distributorId?: string | null;
    salesExecutiveUserId?: string | null;
  }>();
  try {
    const rows = await bulkUpdateAssignments(db, body.dealerIds ?? [], body, c.get("user").id);
    return c.json({ updated: rows.length, items: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bulk update failed";
    return c.json({ error: message }, 400);
  }
});

admin.get("/audit-logs", requirePermission("audit:read"), async (c) => {
  const db = await getDatabase(c.env);
  const { results } = await db.prepare(`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100`).all();
  return c.json(results);
});

admin.get("/signup-applications", requirePermission("signup:review"), async (c) => {
  const db = await getDatabase(c.env);
  return c.json(
    await listSignupApplications(db, {
      search: c.req.query("search"),
      status: c.req.query("status") ?? "pending",
      page: Number(c.req.query("page") ?? 1),
      pageSize: Number(c.req.query("pageSize") ?? 20),
    }),
  );
});

admin.patch("/signup-applications/:id", requirePermission("signup:review"), async (c) => {
  const db = await getDatabase(c.env);
  const body = await c.req.json();
  try {
    const result = await reviewSignupApplication(db, c.req.param("id"), body, c.get("user").id);
    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Review failed";
    return c.json({ error: message }, 400);
  }
});

app.route("/api/v1/admin", admin);

// Internal / cron
app.post("/api/v1/internal/cron/reminders", async (c) => {
  const db = await getDatabase(c.env);
  await scanPendingOrderReminders(db);
  return c.json({ ok: true });
});

app.post("/api/v1/internal/whatsapp/process", async (c) => {
  const db = await getDatabase(c.env);
  const body = await c.req.json<{ outboxId: string }>();
  await processWhatsappOutbox(db, body.outboxId);
  return c.json({ ok: true });
});

// Salespeople for dealer
app.get("/api/v1/dealer/salespeople", requireAuth, requireActiveAccount, async (c) => {
  const db = await getDatabase(c.env);
  const user = c.get("user");
  if (!user.dealerId) return c.json([]);
  const { results } = await db
    .prepare(`SELECT id, name FROM salespeople WHERE dealer_id = ? AND active = 1`)
    .bind(user.dealerId)
    .all();
  return c.json(results);
});

function mapDealerRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    distributorId: row.distributor_id,
    code: row.code,
    name: row.store_name,
    contactName: row.contact_name,
    location: row.location,
    address: row.address,
    phone: row.phone,
    email: row.email,
    gstNumber: row.gst_number,
    active: Boolean(row.active),
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

export async function handleApiRequest(
  request: Request,
  env?: ApiEnv,
  _ctx?: unknown,
): Promise<Response> {
  return app.fetch(request, env ?? ({} as ApiEnv), _ctx as ExecutionContext);
}

export { app };
