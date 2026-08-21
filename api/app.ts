import { Hono } from "hono";
import { cors } from "hono/cors";
import { AppError } from "./errors";
import type { ApiEnv, AppVariables } from "./types";
import { getRequestDb } from "./db/get-db";
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
import {
  archiveRewardCatalogItem,
  getRewardCatalogItem,
  listRewardCatalogAdmin,
  listRewardClaimsAdmin,
  saveRewardCatalogItem,
  undoRewardClaim,
  updateRewardClaimStatus,
} from "./services/rewards-admin";
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
  getUserCreateOptions,
  listAdminUsers,
  resendAdminUserInvite,
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
  getAdminCampaign,
  listAdminCampaigns,
  saveAdminCampaign,
} from "./services/campaigns-admin";
import { buildAdminAnalyticsFromDb, exploreAdminHierarchy } from "./services/admin-analytics";
import { mapDealerRow } from "./services/dealers";
import { redeemRewardClaim } from "./services/reward-redemption";
import { createSignupApplication } from "./services/signup";
import { listSignupApplications, reviewSignupApplication } from "./services/signup-review";
import { buildPriceQuote } from "./services/pricing";
import { listAuditLogs } from "./services/audit";
import { fileToImageDataUrl } from "./services/image-data-url";
import {
  getPublicCampaignById,
  listDealerCampaigns,
  listDistributorCampaigns,
} from "./services/campaigns-public";

const app = new Hono<{ Bindings: ApiEnv; Variables: AppVariables }>();

function isProductionEnv(env: ApiEnv) {
  return env.ENVIRONMENT === "production";
}

function requireInternalSecret(c: { env: ApiEnv; req: { header: (name: string) => string | undefined } }) {
  const secret = c.env.CRON_SECRET;
  if (!secret) return { ok: false as const, status: 503 as const, error: "Internal endpoints not configured" };
  if (c.req.header("x-cron-secret") !== secret) {
    return { ok: false as const, status: 401 as const, error: "Unauthorized" };
  }
  return { ok: true as const };
}

app.use("/api/v1/*", async (c, next) => {
  await getRequestDb(c);
  await next();
});

app.use(
  "/api/v1/*",
  cors({
    origin: (origin) => origin ?? "",
    credentials: true,
  }),
);

app.onError((err, c) => {
  if (err instanceof AppError) {
    if (err.statusCode >= 500) console.error(err);
    return c.json({ error: err.message }, err.statusCode);
  }
  const message = err instanceof Error ? err.message : "Request failed";
  console.error(err);
  return c.json({ error: message }, 500);
});


app.get("/api/v1/health", (c) => c.json({ ok: true }));

// Auth
app.post("/api/v1/auth/otp/request", async (c) => {
  const body = await c.req.json<{ phone: string }>();
  const db = await getRequestDb(c);
  const result = await requestOtp(db, body.phone, c.env.ENVIRONMENT);
  return c.json(result);
});

app.post("/api/v1/auth/otp/verify", async (c) => {
  const body = await c.req.json<{ phone: string; code: string }>();
  const db = await getRequestDb(c);
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

  return c.json({ user }, 200, {
    "Set-Cookie": setSessionCookie(sessionId, isProductionEnv(c.env)),
  });
});

app.post("/api/v1/auth/logout", requireAuth, async (c) => {
  const db = await getRequestDb(c);
  await db.prepare(`DELETE FROM sessions WHERE id = ?`).bind(c.get("sessionId")).run();
  return c.json({ ok: true }, 200, {
    "Set-Cookie": clearSessionCookie(isProductionEnv(c.env)),
  });
});

app.get("/api/v1/auth/me", requireAuth, (c) => c.json({ user: c.get("user") }));

// Catalog
app.get("/api/v1/catalog", requireAuth, requireActiveAccount, requirePermission("catalog:read"), async (c) => {
  const db = await getRequestDb(c);
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
  const db = await getRequestDb(c);
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
  const campaignId = c.req.query("campaignId");
  const quote = await buildPriceQuote(db, {
    productId,
    quantity: 1,
    campaignId: campaignId || undefined,
  });

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
  const body = await c.req.json<{ productId: string; quantity: number; thickness?: string; campaignId?: string }>();
  const db = await getRequestDb(c);
  const quote = await buildPriceQuote(db, body);
  return c.json(quote);
});

// Orders
app.post("/api/v1/orders", requireAuth, requireActiveAccount, requirePermission("orders:create"), async (c) => {
  const db = await getRequestDb(c);
  const body = await c.req.json();
  const order = await createOrder(db, c.get("user"), body, c.env);
  return c.json(order, 201);
});

app.get("/api/v1/orders", requireAuth, requireActiveAccount, requirePermission("orders:read"), async (c) => {
  const db = await getRequestDb(c);
  const user = c.get("user");
  const search = c.req.query("search");
  const status = c.req.query("status");
  const fromDate = c.req.query("fromDate");
  const toDate = c.req.query("toDate");
  const page = c.req.query("page");
  const pageSize = c.req.query("pageSize");

  const opts = {
    status,
    search,
    fromDate,
    toDate,
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
  const db = await getRequestDb(c);
  const orderId = c.req.param("id");
  if (!(await canAccessOrder(db, c.get("user"), orderId))) return c.json({ error: "Forbidden" }, 403);
  const order = await getOrderById(db, orderId);
  if (!order) return c.json({ error: "Not found" }, 404);
  return c.json(order);
});

app.post("/api/v1/orders/:id/approve", requireAuth, requireActiveAccount, requirePermission("orders:approve"), async (c) => {
  const db = await getRequestDb(c);
  const orderId = c.req.param("id");
  if (!(await canAccessOrder(db, c.get("user"), orderId))) return c.json({ error: "Forbidden" }, 403);
  const order = await approveOrder(db, orderId, c.get("user"), c.env);
  return c.json(order);
});

app.patch("/api/v1/orders/:id/status", requireAuth, requireActiveAccount, async (c) => {
  const db = await getRequestDb(c);
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
  if (user.role !== "master_admin") {
    if (status === "approved") {
      if (!user.permissions.includes("orders:approve")) return c.json({ error: "Forbidden" }, 403);
    } else if (fulfillmentStatuses.includes(status)) {
      if (!user.permissions.includes("orders:status:fulfillment")) {
        return c.json({ error: "Forbidden" }, 403);
      }
    } else {
      return c.json({ error: "Forbidden" }, 403);
    }
  }

  const order = await updateOrderStatus(db, orderId, status, user, c.env);
  return c.json(order);
});

app.get("/api/v1/orders/:id/status-options", requireAuth, requireActiveAccount, requirePermission("orders:read"), async (c) => {
  const db = await getRequestDb(c);
  const orderId = c.req.param("id");
  if (!(await canAccessOrder(db, c.get("user"), orderId))) return c.json({ error: "Forbidden" }, 403);
  const row = await db.prepare(`SELECT status FROM orders WHERE id = ?`).bind(orderId).first<{ status: string }>();
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ allowed: getAllowedStatusTargets(c.get("user"), row.status) });
});

app.post("/api/v1/orders/:id/reject", requireAuth, requireActiveAccount, requirePermission("orders:reject"), async (c) => {
  const db = await getRequestDb(c);
  const orderId = c.req.param("id");
  const body = await c.req.json<{ reason: string }>();
  if (!body.reason?.trim()) return c.json({ error: "Reason required" }, 400);
  if (!(await canAccessOrder(db, c.get("user"), orderId))) return c.json({ error: "Forbidden" }, 403);
  const order = await rejectOrder(db, orderId, body.reason.trim(), c.get("user"), c.env);
  return c.json(order);
});

app.post("/api/v1/orders/:id/cancel", requireAuth, requireActiveAccount, requirePermission("orders:cancel"), async (c) => {
  const db = await getRequestDb(c);
  const orderId = c.req.param("id");
  const body = await c.req.json<{ reason?: string }>().catch(() => ({ reason: undefined }));
  if (!(await canAccessOrder(db, c.get("user"), orderId))) return c.json({ error: "Forbidden" }, 403);
  const order = await cancelApprovedOrder(db, orderId, c.get("user"), body.reason);
  return c.json(order);
});

app.get("/api/v1/dealers/:id/orders", requireAuth, requireActiveAccount, requirePermission("orders:read"), async (c) => {
  const db = await getRequestDb(c);
  const dealerId = c.req.param("id");
  if (!(await canAccessDealer(db, c.get("user"), dealerId))) return c.json({ error: "Forbidden" }, 403);
  return c.json(await listOrders(db, { dealerIds: [dealerId] }));
});

// Dealers
app.get("/api/v1/dealers", requireAuth, requireActiveAccount, requirePermission("dealers:read"), async (c) => {
  const db = await getRequestDb(c);
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
  return c.json(await Promise.all(results.map((row) => mapDealerRow(db, row))));
});

app.get("/api/v1/dealers/:id", requireAuth, requireActiveAccount, requirePermission("dealers:read"), async (c) => {
  const db = await getRequestDb(c);
  const dealerId = c.req.param("id");
  if (!(await canAccessDealer(db, c.get("user"), dealerId))) return c.json({ error: "Forbidden" }, 403);
  const row = await db.prepare(`SELECT * FROM dealers WHERE id = ?`).bind(dealerId).first();
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(await mapDealerRow(db, row));
});

app.get("/api/v1/dealers/:id/performance", requireAuth, requireActiveAccount, requirePermission("dealers:read"), async (c) => {
  const db = await getRequestDb(c);
  const dealerId = c.req.param("id");
  if (!(await canAccessDealer(db, c.get("user"), dealerId))) return c.json({ error: "Forbidden" }, 403);
  const { results } = await db
    .prepare(
      `SELECT strftime('%Y-%m', placed_at) as month, COUNT(*) as orders, SUM(total_value) as orderValue
       FROM orders WHERE dealer_id = ? AND deleted_at IS NULL
         AND status NOT IN ('rejected', 'cancelled')
       GROUP BY month ORDER BY month DESC LIMIT 6`,
    )
    .bind(dealerId)
    .all();
  return c.json(results);
});

app.get("/api/v1/dealers/:id/reward-claims", requireAuth, requireActiveAccount, requirePermission("rewards:read"), async (c) => {
  const db = await getRequestDb(c);
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
  const db = await getRequestDb(c);
  const tab = (c.req.query("tab") ?? "active") as "active" | "upcoming" | "expired";
  const campaigns = await listDealerCampaigns(db, tab);
  return c.json({
    campaigns: campaigns.map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      productId: campaign.productId,
      productName: campaign.productName,
      discountPercent: campaign.discountPercent,
      description: campaign.description,
      badgeLabel: campaign.badgeLabel,
      startDate: campaign.startDate,
      endDate: campaign.endDate,
      status: campaign.status,
      imageUrl: campaign.imageUrl,
      target: campaign.target,
      done: campaign.done,
    })),
  });
});

app.get("/api/v1/campaigns/:id", requireAuth, requireActiveAccount, requirePermission("campaigns:read"), async (c) => {
  const db = await getRequestDb(c);
  const campaign = await getPublicCampaignById(db, c.req.param("id"));
  if (!campaign) return c.json({ error: "Campaign not found" }, 404);
  return c.json(campaign);
});

app.get("/api/v1/distributor/campaigns", requireAuth, requireActiveAccount, requirePermission("campaigns:read"), async (c) => {
  const db = await getRequestDb(c);
  const user = c.get("user");
  const tab = c.req.query("tab") as "active" | "upcoming" | "expired" | undefined;
  const campaigns = await listDistributorCampaigns(db, user.distributorId, tab);
  return c.json(
    campaigns.map((campaign) => ({
      id: campaign.id,
      distributorId: campaign.distributorId ?? "",
      name: campaign.name,
      product: campaign.productName ?? "All products",
      productId: campaign.productId,
      discountLabel:
        campaign.badgeLabel ??
        (campaign.discountPercent ? `${campaign.discountPercent}% off` : "Campaign offer"),
      description: campaign.description,
      startDate: campaign.startDate,
      endDate: campaign.endDate,
      status: campaign.status,
      bannerEmoji: "📣",
      imageUrl: campaign.imageUrl,
    })),
  );
});

// Rewards
app.get("/api/v1/rewards/catalog", requireAuth, requireActiveAccount, requirePermission("rewards:read"), async (c) => {
  const db = await getRequestDb(c);
  const { results } = await db
    .prepare(`SELECT * FROM reward_catalog WHERE deleted_at IS NULL AND active = 1`)
    .all();
  return c.json(
    results.map((r) => ({
      id: r.id,
      name: r.name,
      emoji: r.emoji,
      points: r.points_required,
      imageUrl: (r.image_url as string) ?? undefined,
    })),
  );
});

app.get("/api/v1/rewards/balance", requireAuth, requireActiveAccount, requirePermission("rewards:read"), async (c) => {
  const db = await getRequestDb(c);
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
  const db = await getRequestDb(c);
  const user = c.get("user");
  if (!user.dealerId) return c.json([]);
  const { results } = await db
    .prepare(`SELECT label, delta as value, occurred_at as date FROM points_ledger WHERE dealer_id = ? ORDER BY occurred_at DESC LIMIT 50`)
    .bind(user.dealerId)
    .all();
  return c.json(results);
});

app.get("/api/v1/rewards/claims", requireAuth, requireActiveAccount, requirePermission("rewards:read"), async (c) => {
  const db = await getRequestDb(c);
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
      status: r.status,
      delivered: r.delivered_at,
    })),
  );
});

app.post("/api/v1/rewards/claims", requireAuth, requireActiveAccount, requirePermission("rewards:redeem"), async (c) => {
  const db = await getRequestDb(c);
  const user = c.get("user");
  if (!user.dealerId) return c.json({ error: "Dealer required" }, 400);
  const body = await c.req.json<{ rewardId: string }>();
  const reward = await db.prepare(`SELECT * FROM reward_catalog WHERE id = ?`).bind(body.rewardId).first<{
    id: string;
    name: string;
    emoji: string;
    points_required: number;
  }>();
  if (!reward) return c.json({ error: "Reward not found" }, 404);

  try {
    const { claimId } = await redeemRewardClaim(db, user.dealerId, reward);
    const dealer = await db
      .prepare(`SELECT store_name FROM dealers WHERE id = ?`)
      .bind(user.dealerId)
      .first<{ store_name: string }>();

    await notifyMasterAdmins(db, {
      category: "system",
      type: "system",
      title: "Reward claim submitted",
      body: `${dealer?.store_name ?? "Dealer"} claimed ${reward.name} (${reward.points_required} pts)`,
      link: "/admin/rewards/claims",
    });

    return c.json({ id: claimId, status: "pending" }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Redemption failed";
    if (message.includes("Insufficient")) return c.json({ error: message }, 400);
    throw err;
  }
});

// Complaints
app.post("/api/v1/complaints", requireAuth, requireActiveAccount, requirePermission("complaints:create"), async (c) => {
  const db = await getRequestDb(c);
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
  const db = await getRequestDb(c);
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

app.get("/api/v1/complaints/:id", requireAuth, requireActiveAccount, requirePermission("complaints:read"), async (c) => {
  const db = await getRequestDb(c);
  const user = c.get("user");
  const complaintId = c.req.param("id");
  if (!(await canAccessComplaint(db, user, complaintId))) return c.json({ error: "Forbidden" }, 403);

  const row = await db
    .prepare(
      `SELECT c.*, d.store_name as dealer_name, dist.name as distributor_name
       FROM complaints c
       JOIN dealers d ON d.id = c.dealer_id
       JOIN distributors dist ON dist.id = c.distributor_id
       WHERE c.id = ? AND c.deleted_at IS NULL`,
    )
    .bind(complaintId)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ error: "Not found" }, 404);

  return c.json({
    id: row.id,
    orderId: row.order_id,
    dealerId: row.dealer_id,
    dealerName: row.dealer_name,
    distributorName: row.distributor_name,
    category: row.category,
    description: row.description,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    history: [
      { label: "Submitted", at: row.created_at },
      ...(row.status !== "pending"
        ? [{ label: "Status updated", at: row.updated_at, note: `Now ${String(row.status).replace(/_/g, " ")}` }]
        : []),
    ],
  });
});

app.patch("/api/v1/complaints/:id", requireAuth, requireActiveAccount, requirePermission("complaints:update"), async (c) => {
  const db = await getRequestDb(c);
  const user = c.get("user");
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
  const db = await getRequestDb(c);
  return c.json(await listNotifications(db, c.get("user").id));
});

app.patch("/api/v1/notifications/:id/read", requireAuth, requireActiveAccount, requirePermission("notifications:read"), async (c) => {
  const db = await getRequestDb(c);
  await db.prepare(`UPDATE notifications SET read = 1 WHERE id = ? AND recipient_user_id = ?`).bind(c.req.param("id"), c.get("user").id).run();
  return c.json({ ok: true });
});

app.post("/api/v1/notifications/read-all", requireAuth, requireActiveAccount, requirePermission("notifications:read"), async (c) => {
  const db = await getRequestDb(c);
  await db.prepare(`UPDATE notifications SET read = 1 WHERE recipient_user_id = ?`).bind(c.get("user").id).run();
  return c.json({ ok: true });
});

// Reports
app.get("/api/v1/reports/dashboard", requireAuth, requireActiveAccount, requirePermission("reports:read"), async (c) => {
  const db = await getRequestDb(c);
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

  const monthOrderBinds: unknown[] = [];
  let monthOrderSql = `SELECT COUNT(*) as orders, COALESCE(SUM(total_value), 0) as sales
    FROM orders WHERE deleted_at IS NULL
      AND status NOT IN ('rejected', 'cancelled')
      AND strftime('%Y-%m', placed_at) = strftime('%Y-%m', 'now')`;
  monthOrderSql += appendDealerScopeSql(reportScope.dealerIds, "dealer_id", monthOrderBinds);
  const monthStats = await db
    .prepare(monthOrderSql)
    .bind(...monthOrderBinds)
    .first<{ orders: number; sales: number }>();

  const prevMonthBinds: unknown[] = [];
  let prevMonthSql = `SELECT COALESCE(SUM(total_value), 0) as sales
    FROM orders WHERE deleted_at IS NULL
      AND status NOT IN ('rejected', 'cancelled')
      AND strftime('%Y-%m', placed_at) = strftime('%Y-%m', 'now', '-1 month')`;
  prevMonthSql += appendDealerScopeSql(reportScope.dealerIds, "dealer_id", prevMonthBinds);
  const prevMonth = await db
    .prepare(prevMonthSql)
    .bind(...prevMonthBinds)
    .first<{ sales: number }>();

  const pointsBinds: unknown[] = [];
  let pointsSql = `SELECT COALESCE(SUM(pl.delta), 0) as pts
    FROM points_ledger pl JOIN dealers d ON d.id = pl.dealer_id
    WHERE pl.delta > 0 AND strftime('%Y-%m', pl.occurred_at) = strftime('%Y-%m', 'now')`;
  pointsSql += appendDealerScopeSql(reportScope.dealerIds, "d.id", pointsBinds);
  const pointsRow = await db.prepare(pointsSql).bind(...pointsBinds).first<{ pts: number }>();

  const monthlySales = monthStats?.sales ?? 0;
  const prevMonthSales = prevMonth?.sales ?? 0;
  const salesGrowth =
    prevMonthSales > 0
      ? Math.round(((monthlySales - prevMonthSales) / prevMonthSales) * 100)
      : monthlySales > 0
        ? 100
        : 0;

  return c.json({
    totalDealers: dealers?.c ?? 0,
    activeDealers: active?.c ?? 0,
    ordersThisMonth: monthStats?.orders ?? 0,
    monthlySales,
    pendingApprovals: pending?.c ?? 0,
    openComplaints: complaints?.c ?? 0,
    rewardPointsGenerated: pointsRow?.pts ?? 0,
    salesGrowth,
    prevMonthSales,
  });
});

app.get("/api/v1/reports/monthly-sales", requireAuth, requireActiveAccount, requirePermission("reports:read"), async (c) => {
  const db = await getRequestDb(c);
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
  const db = await getRequestDb(c);
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

app.get("/api/v1/reports/dealer-performance", requireAuth, requireActiveAccount, requirePermission("reports:read"), async (c) => {
  const db = await getRequestDb(c);
  const user = c.get("user");
  const reportScope = await resolveReportScope(db, user);
  if (!reportScope.allowed) return c.json({ error: "Forbidden" }, 403);

  const period = c.req.query("period") ?? "month";
  const now = new Date();
  let currentStart: Date;
  let currentEnd = now;
  let previousStart: Date;
  let previousEnd: Date;

  if (period === "week") {
    currentStart = new Date(now);
    currentStart.setDate(now.getDate() - 7);
    previousEnd = new Date(currentStart);
    previousStart = new Date(previousEnd);
    previousStart.setDate(previousEnd.getDate() - 7);
  } else if (period === "quarter") {
    currentStart = new Date(now);
    currentStart.setMonth(now.getMonth() - 3);
    previousEnd = new Date(currentStart);
    previousStart = new Date(previousEnd);
    previousStart.setMonth(previousEnd.getMonth() - 3);
  } else if (period === "year") {
    currentStart = new Date(now);
    currentStart.setFullYear(now.getFullYear() - 1);
    previousEnd = new Date(currentStart);
    previousStart = new Date(previousEnd);
    previousStart.setFullYear(previousEnd.getFullYear() - 1);
  } else {
    currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
    previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    previousEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
  }

  const currentMonth = currentStart.toLocaleString("en-IN", { month: "short", year: "numeric" });
  const previousMonth = previousStart.toLocaleString("en-IN", { month: "short", year: "numeric" });

  const binds: unknown[] = [currentStart.toISOString(), currentEnd.toISOString(), previousStart.toISOString(), previousEnd.toISOString()];
  let dealerFilter = "";
  if (reportScope.dealerIds !== "all") {
    dealerFilter = appendDealerScopeSql(reportScope.dealerIds, "d.id", binds);
  }

  const dealerIdFilter = c.req.query("dealerId");
  if (dealerIdFilter) {
    dealerFilter += ` AND d.id = ?`;
    binds.push(dealerIdFilter);
  }

  const sql = `
    SELECT
      d.id,
      d.store_name AS name,
      d.code,
      COALESCE(cur.sales, 0) AS current_sales,
      COALESCE(cur.orders, 0) AS current_orders,
      COALESCE(prev.sales, 0) AS previous_sales,
      COALESCE(prev.orders, 0) AS previous_orders
    FROM dealers d
    LEFT JOIN (
      SELECT dealer_id, SUM(total_value) AS sales, COUNT(*) AS orders
      FROM orders
      WHERE deleted_at IS NULL AND placed_at >= ? AND placed_at <= ?
      GROUP BY dealer_id
    ) cur ON cur.dealer_id = d.id
    LEFT JOIN (
      SELECT dealer_id, SUM(total_value) AS sales, COUNT(*) AS orders
      FROM orders
      WHERE deleted_at IS NULL AND placed_at >= ? AND placed_at <= ?
      GROUP BY dealer_id
    ) prev ON prev.dealer_id = d.id
    WHERE d.deleted_at IS NULL${dealerFilter}
    ORDER BY current_sales DESC, d.store_name ASC
  `;

  const { results } = await db.prepare(sql).bind(...binds).all<{
    id: string;
    name: string;
    code: string;
    current_sales: number;
    current_orders: number;
    previous_sales: number;
    previous_orders: number;
  }>();

  const dealers = (results ?? []).map((row) => {
    const currentSales = Number(row.current_sales) || 0;
    const previousSales = Number(row.previous_sales) || 0;
    const currentOrders = Number(row.current_orders) || 0;
    const previousOrders = Number(row.previous_orders) || 0;
    const salesChangePct =
      previousSales > 0
        ? Math.round(((currentSales - previousSales) / previousSales) * 100)
        : currentSales > 0
          ? 100
          : 0;
    const ordersChangePct =
      previousOrders > 0
        ? Math.round(((currentOrders - previousOrders) / previousOrders) * 100)
        : currentOrders > 0
          ? 100
          : 0;

    return {
      id: row.id,
      name: row.name,
      code: row.code,
      currentMonth,
      previousMonth,
      currentSales,
      previousSales,
      currentOrders,
      previousOrders,
      salesChangePct,
      ordersChangePct,
    };
  });

  return c.json({ currentMonth, previousMonth, dealers });
});

// Signup
app.post("/api/v1/signup/applications", async (c) => {
  const db = await getRequestDb(c);
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
  const db = await getRequestDb(c);
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

admin.get("/users/create-options", requirePermission("users:write"), async (c) => {
  const db = await getRequestDb(c);
  return c.json(await getUserCreateOptions(db));
});

admin.get("/users/:id", requirePermission("users:read"), async (c) => {
  const db = await getRequestDb(c);
  const user = await getAdminUser(db, c.req.param("id"));
  if (!user) return c.json({ error: "User not found" }, 404);
  return c.json(user);
});

admin.post("/users", requirePermission("users:write"), async (c) => {
  const db = await getRequestDb(c);
  const body = await c.req.json();
  try {
    const user = await createAdminUser(db, body, c.get("user").id, c.get("user").role, {
      env: c.env,
      portalBaseUrl: new URL(c.req.url).origin,
    });
    return c.json(user, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Create failed";
    return c.json({ error: message }, 400);
  }
});

admin.post("/users/:id/resend-invite", requirePermission("users:write"), async (c) => {
  const db = await getRequestDb(c);
  try {
    const result = await resendAdminUserInvite(db, c.req.param("id"), c.get("user").id, {
      env: c.env,
      portalBaseUrl: new URL(c.req.url).origin,
    });
    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Resend failed";
    const status = message.includes("not found") ? 404 : 400;
    return c.json({ error: message }, status);
  }
});

admin.patch("/users/:id", requirePermission("users:write"), async (c) => {
  const db = await getRequestDb(c);
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
  const db = await getRequestDb(c);
  try {
    return c.json(await softDeleteAdminUser(db, c.req.param("id"), c.get("user").id));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delete failed";
    const status = message.includes("not found") ? 404 : 400;
    return c.json({ error: message }, status);
  }
});

admin.get("/products", requirePermission("catalog:read"), async (c) => {
  const db = await getRequestDb(c);
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
  const db = await getRequestDb(c);
  const product = await getAdminProduct(db, c.req.param("id"));
  if (!product) return c.json({ error: "Product not found" }, 404);
  return c.json(product);
});

admin.post("/products", requirePermission("catalog:write"), async (c) => {
  const db = await getRequestDb(c);
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
  const db = await getRequestDb(c);
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
  const db = await getRequestDb(c);
  try {
    return c.json(await archiveAdminProduct(db, c.req.param("id"), c.get("user").id));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Archive failed";
    return c.json({ error: message }, message.includes("not found") ? 404 : 400);
  }
});

admin.patch("/products/:id/restore", requirePermission("catalog:write"), async (c) => {
  const db = await getRequestDb(c);
  try {
    return c.json(await restoreAdminProduct(db, c.req.param("id"), c.get("user").id));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Restore failed";
    return c.json({ error: message }, message.includes("not found") ? 404 : 400);
  }
});

admin.get("/campaigns", requirePermission("campaigns:read"), async (c) => {
  const db = await getRequestDb(c);
  return c.json(
    await listAdminCampaigns(db, {
      search: c.req.query("search"),
      status: c.req.query("status"),
      active: (c.req.query("active") as "all" | "active" | "inactive") ?? "all",
      page: Number(c.req.query("page") ?? 1),
      pageSize: Number(c.req.query("pageSize") ?? 20),
    }),
  );
});

admin.get("/campaigns/:id", requirePermission("campaigns:read"), async (c) => {
  const db = await getRequestDb(c);
  const campaign = await getAdminCampaign(db, c.req.param("id"));
  if (!campaign) return c.json({ error: "Campaign not found" }, 404);
  return c.json(campaign);
});

admin.post("/campaigns", requirePermission("campaigns:write"), async (c) => {
  const db = await getRequestDb(c);
  const body = await c.req.json();
  try {
    const campaign = await saveAdminCampaign(db, body, c.get("user").id);
    return c.json(campaign, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Create failed";
    return c.json({ error: message }, 400);
  }
});

admin.patch("/campaigns/:id", requirePermission("campaigns:write"), async (c) => {
  const db = await getRequestDb(c);
  const body = await c.req.json();
  try {
    const campaign = await saveAdminCampaign(db, body, c.get("user").id, c.req.param("id"));
    return c.json(campaign);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    return c.json({ error: message }, message.includes("not found") ? 404 : 400);
  }
});

admin.patch("/campaigns/:id/archive", requirePermission("campaigns:write"), async (c) => {
  const db = await getRequestDb(c);
  try {
    return c.json(await archiveAdminCampaign(db, c.req.param("id"), c.get("user").id));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Archive failed";
    return c.json({ error: message }, message.includes("not found") ? 404 : 400);
  }
});

admin.patch("/campaigns/:id/activate", requirePermission("campaigns:write"), async (c) => {
  const db = await getRequestDb(c);
  try {
    return c.json(await activateAdminCampaign(db, c.req.param("id"), c.get("user").id));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Activate failed";
    return c.json({ error: message }, message.includes("not found") ? 404 : 400);
  }
});

admin.post("/campaigns/upload-image", requirePermission("campaigns:write"), async (c) => {
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return c.json({ error: "No image file provided" }, 400);
  try {
    const imageUrl = await fileToImageDataUrl(file);
    return c.json({ imageUrl });
  } catch (err) {
    if (err instanceof AppError) return c.json({ error: err.message }, err.statusCode);
    const message = err instanceof Error ? err.message : "Upload failed";
    return c.json({ error: message }, 400);
  }
});

admin.get("/analytics", requirePermission("reports:read"), async (c) => {
  const db = await getRequestDb(c);
  return c.json(
    await buildAdminAnalyticsFromDb(db, {
      month: c.req.query("month"),
      fromMonth: c.req.query("fromMonth"),
      toMonth: c.req.query("toMonth"),
      distributorId: c.req.query("distributorId"),
      salesExecutiveId: c.req.query("salesExecutiveId"),
      dealerId: c.req.query("dealerId"),
      product: c.req.query("product"),
      search: c.req.query("search"),
    }),
  );
});

admin.get("/explore", requirePermission("reports:read"), async (c) => {
  const db = await getRequestDb(c);
  return c.json(
    await exploreAdminHierarchy(db, {
      level: c.req.query("level") as "distributors" | "dealers" | "orders" | undefined,
      distributorId: c.req.query("distributorId"),
      dealerId: c.req.query("dealerId"),
      search: c.req.query("search"),
      from: c.req.query("from"),
      to: c.req.query("to"),
    }),
  );
});

admin.get("/system-notifications", requirePermission("settings:read"), async (c) => {
  const db = await getRequestDb(c);
  const category = c.req.query("category");
  const binds: unknown[] = [];
  let sql = `SELECT n.*, u.name as recipient_name FROM notifications n
    LEFT JOIN users u ON u.id = n.recipient_user_id WHERE 1=1`;
  if (category && category !== "all") {
    sql += ` AND n.category = ?`;
    binds.push(category);
  }
  sql += ` ORDER BY n.created_at DESC LIMIT 100`;
  const { results } = await db.prepare(sql).bind(...binds).all();
  return c.json(results);
});

admin.patch("/system-notifications/:id", requirePermission("settings:write"), async (c) => {
  const db = await getRequestDb(c);
  const body = await c.req.json<{ title?: string; body?: string }>();
  await db
    .prepare(`UPDATE notifications SET title = COALESCE(?, title), body = COALESCE(?, body) WHERE id = ?`)
    .bind(body.title ?? null, body.body ?? null, c.req.param("id"))
    .run();
  return c.json({ ok: true });
});

admin.delete("/system-notifications/:id", requirePermission("settings:write"), async (c) => {
  const db = await getRequestDb(c);
  await db.prepare(`DELETE FROM notifications WHERE id = ?`).bind(c.req.param("id")).run();
  return c.json({ ok: true });
});

admin.get("/rewards", requirePermission("rewards:read"), async (c) => {
  const db = await getRequestDb(c);
  const items = await listRewardCatalogAdmin(db);
  return c.json({ items, total: items.length, page: 1, pageSize: items.length, totalPages: 1 });
});

admin.get("/rewards/:id", requirePermission("rewards:read"), async (c) => {
  const db = await getRequestDb(c);
  const item = await getRewardCatalogItem(db, c.req.param("id"));
  if (!item) return c.json({ error: "Not found" }, 404);
  return c.json(item);
});

admin.post("/rewards", requirePermission("catalog:write"), async (c) => {
  const db = await getRequestDb(c);
  const body = await c.req.json<{
    id?: string;
    name: string;
    emoji: string;
    pointsRequired: number;
    active?: boolean;
    imageUrl?: string | null;
  }>();
  try {
    const item = await saveRewardCatalogItem(db, body, c.get("user").id);
    return c.json(item, 201);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Create failed" }, 400);
  }
});

admin.patch("/rewards/:id", requirePermission("catalog:write"), async (c) => {
  const db = await getRequestDb(c);
  const body = await c.req.json<{
    name: string;
    emoji: string;
    pointsRequired: number;
    active?: boolean;
    imageUrl?: string | null;
  }>();
  try {
    const item = await saveRewardCatalogItem(db, { ...body, id: c.req.param("id") }, c.get("user").id);
    return c.json(item);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Update failed" }, 400);
  }
});

admin.delete("/rewards/:id", requirePermission("catalog:write"), async (c) => {
  const db = await getRequestDb(c);
  await archiveRewardCatalogItem(db, c.req.param("id"), c.get("user").id);
  return c.json({ ok: true });
});

admin.post("/rewards/upload-image", requirePermission("catalog:write"), async (c) => {
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return c.json({ error: "No image file provided" }, 400);
  try {
    const imageUrl = await fileToImageDataUrl(file);
    return c.json({ imageUrl });
  } catch (err) {
    if (err instanceof AppError) return c.json({ error: err.message }, err.statusCode);
    const message = err instanceof Error ? err.message : "Upload failed";
    return c.json({ error: message }, 400);
  }
});

admin.get("/reward-claims", requirePermission("rewards:read"), async (c) => {
  const db = await getRequestDb(c);
  return c.json(
    await listRewardClaimsAdmin(db, {
      status: c.req.query("status"),
      search: c.req.query("search"),
      page: Number(c.req.query("page") ?? 1),
      pageSize: Number(c.req.query("pageSize") ?? 10),
    }),
  );
});

admin.patch("/reward-claims/:id", requirePermission("rewards:read"), async (c) => {
  const db = await getRequestDb(c);
  const body = await c.req.json<{ status: "pending" | "delivered" }>();
  try {
    return c.json(await updateRewardClaimStatus(db, c.req.param("id"), body.status, c.get("user").id));
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Update failed" }, 400);
  }
});

admin.post("/reward-claims/:id/undo", requirePermission("catalog:write"), async (c) => {
  const db = await getRequestDb(c);
  try {
    return c.json(await undoRewardClaim(db, c.req.param("id"), c.get("user").id));
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Undo failed" }, 400);
  }
});

admin.get("/settings", requirePermission("settings:read"), async (c) => {
  const db = await getRequestDb(c);
  const { results } = await db.prepare(`SELECT * FROM system_settings`).all();
  return c.json(results);
});

admin.patch("/settings/:key", requirePermission("settings:write"), async (c) => {
  const db = await getRequestDb(c);
  const body = await c.req.json<{ value: string }>();
  await db
    .prepare(`INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
    .bind(c.req.param("key"), body.value, nowIso())
    .run();
  return c.json({ ok: true });
});

admin.get("/assignments", requirePermission("assignments:read"), async (c) => {
  const db = await getRequestDb(c);
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
  const db = await getRequestDb(c);
  return c.json(await getAssignmentSummary(db));
});

admin.get("/assignments/options", requirePermission("assignments:read"), async (c) => {
  const db = await getRequestDb(c);
  return c.json(await getAssignmentOptions(db));
});

admin.patch("/assignments/dealers/:dealerId", requirePermission("assignments:write"), async (c) => {
  const db = await getRequestDb(c);
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
  const db = await getRequestDb(c);
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
  const db = await getRequestDb(c);
  return c.json(await listAuditLogs(db, { limit: Number(c.req.query("limit") ?? 200) }));
});

admin.get("/signup-applications", requirePermission("signup:review"), async (c) => {
  const db = await getRequestDb(c);
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
  const db = await getRequestDb(c);
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
  const auth = requireInternalSecret(c);
  if (!auth.ok) return c.json({ error: auth.error }, auth.status);
  const db = await getRequestDb(c);
  await scanPendingOrderReminders(db);
  return c.json({ ok: true });
});

app.post("/api/v1/internal/whatsapp/process", async (c) => {
  const auth = requireInternalSecret(c);
  if (!auth.ok) return c.json({ error: auth.error }, auth.status);
  const db = await getRequestDb(c);
  const body = await c.req.json<{ outboxId: string }>();
  await processWhatsappOutbox(db, body.outboxId);
  return c.json({ ok: true });
});

// Salespeople for dealer
app.get("/api/v1/dealer/salespeople", requireAuth, requireActiveAccount, async (c) => {
  const db = await getRequestDb(c);
  const user = c.get("user");
  if (!user.dealerId) return c.json([]);
  const { results } = await db
    .prepare(`SELECT id, name FROM salespeople WHERE dealer_id = ? AND active = 1`)
    .bind(user.dealerId)
    .all();
  return c.json(results);
});

export async function handleApiRequest(
  request: Request,
  env?: ApiEnv,
  _ctx?: unknown,
): Promise<Response> {
  return app.fetch(request, env ?? ({} as ApiEnv), _ctx as ExecutionContext);
}

export { app };
