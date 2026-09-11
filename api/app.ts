import { Hono } from "hono";
import { cors } from "hono/cors";
import { AppError } from "./errors";
import type { ApiEnv, AppVariables } from "./types";
import { getRequestDb } from "./db/get-db";
import {
  requireAuth,
  requireActiveAccount,
  requirePermission,
  requireAnyPermission,
  setSessionCookie,
  clearSessionCookie,
  setSessionPresentCookie,
  clearSessionPresentCookie,
  isSecureCookieEnv,
} from "./middleware/auth";
import { buildSessionUser, resolveEffectiveRole } from "./rbac";
import {
  currentMonthLabels,
  formatInLabel,
  formatYearMonthLabel,
  id,
  isDemoModeEnabled,
  istTodayIso,
  nextComplaintNumber,
  normalizePhone,
  nowIso,
  SESSION_DAYS,
  sessionId as newSessionId,
  sha256,
} from "./utils";
import { requestOtp, verifyOtp } from "./services/otp";
import { resolveDemoLoginUser } from "./services/demo-auth";
import { createSessionForUserRow } from "./services/sessions";
import {
  archiveRewardCatalogItem,
  getRewardCatalogItem,
  listRewardCatalogAdmin,
  saveRewardCatalogItem,
  undoRewardClaim,
  updateRewardClaimStatus,
} from "./services/rewards-admin";
import {
  createOrder,
  approveOrder,
  rejectOrder,
  OrderConflictError,
  OrderValidationError,
  cancelApprovedOrder,
  getOrderById,
  listOrders,
  updateOrderStatus,
  getAllowedStatusTargets,
  getOrderStatusCounts,
  updateOrderLineItems,
} from "./services/orders";
import { InvalidStatusTransitionError } from "./order-status";
import {
  canAccessDealer,
  canAccessOrder,
  canAccessComplaint,
  resolveReportScope,
  appendUserDealerScopeSql,
} from "./services/scope";
import {
  notifyComplaintCreated,
  notifyComplaintUpdated,
  notifyRewardClaim,
} from "./services/notification-events";
import { createNotification, getUnreadNotificationCount, listNotifications } from "./services/notifications";
import {
  sendPushForNotifications,
  deletePushSubscription,
  getPushSubscriptionStatus,
  getVapidPublicKeyFromEnv,
  savePushSubscription,
} from "./services/push-notifications";
import { setPushEnv, resolveExecutionContext, snapshotPushContext, runBackground } from "./push-env";
import {
  processWhatsappOutbox,
  scanPendingOrderReminders,
  listWhatsappOutbox,
  sendWhatsappTest,
  checkWhatsappDeliveryStatus,
} from "./services/whatsapp";
import {
  bulkUpdateAssignments,
  getAssignmentOptions,
  getSignupApprovalOptions,
  getAssignmentSummary,
  listAssignmentRows,
  updateDealerAssignment,
} from "./services/assignments";
import { listSalesExecutives, getSalesExecutiveDetail } from "./services/sales-executives";
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
  deleteAdminProduct,
  createAdminProduct,
  getAdminProduct,
  listAdminProducts,
  restoreAdminProduct,
  updateAdminProduct,
} from "./services/products-admin";
import { completeProductIds, isMattressCategory } from "./services/product-sqft-rates";
import { lookupPincode } from "./services/pincodes";
import {
  activateAdminCampaign,
  archiveAdminCampaign,
  getAdminCampaign,
  listAdminCampaigns,
  saveAdminCampaign,
} from "./services/campaigns-admin";
import { buildAdminAnalyticsFromDb, exploreAdminHierarchy } from "./services/admin-analytics";
import {
  buildAccountsReport,
  buildExecutiveSnapshot,
  buildMonthlyReport,
  buildProductsReport,
  drilldownOrders,
} from "./services/admin-executive-reports";
import {
  deletePricingTier,
  listPricingTiers,
  savePricingTier,
} from "./services/pricing-tiers";
import {
  checkInVisit,
  checkOutVisit,
  getActiveVisit,
  getVisitById,
  getVisitSummary,
  listVisits,
} from "./services/dealer-visits";
import { mapDealerRow, mapDealerRows, loadDealerRewards, loadDealerActivity } from "./services/dealers";
import { redeemRewardClaim } from "./services/reward-redemption";
import { listAdditionalRewardsForDealer, redeemAdditionalReward } from "./services/additional-rewards";
import {
  advanceRewardClaimStatus,
  getRewardClaimDetail,
  listRewardClaimsScoped,
} from "./services/reward-claims";
import {
  creditDealerPointsManual,
  getDealerBalanceSummary,
  getRewardResetStatus,
  resetAllDealerRewards,
} from "./services/reward-points-admin";
import {
  normalizeRewardClaimStatus,
  REWARD_CLAIM_STATUSES,
  type RewardClaimStatus,
} from "../shared/reward-claim-status";
import {
  coerceRewardPoints,
  getDealerPointsBalance,
  getNextRewardThreshold,
} from "./services/reward-points";
import { hasRewardKindColumn, standardCatalogSqlFilter } from "./db/reward-schema";
import { createSignupApplication } from "./services/signup";
import { listSignupApplications, reviewSignupApplication } from "./services/signup-review";
import {
  insertComplaintTimelineEvent,
  listComplaintTimelineForApi,
} from "./services/complaint-timeline";
import { buildPriceQuote, calculateRewardPoints, getCampaignPrice } from "./services/pricing";
import { applyMattressPricing, configureStandardSizeBuffer } from "./services/mattress-pricing";
import { listAuditLogs } from "./services/audit";
import { fileToImageDataUrl } from "./services/image-data-url";
import {
  getPublicCampaignById,
  listDealerCampaigns,
  listDistributorCampaigns,
} from "./services/campaigns-public";

const app = new Hono<{ Bindings: ApiEnv; Variables: AppVariables }>();
const VALID_COMPLAINT_STATUSES = new Set(["pending", "in_progress", "resolved", "rejected"]);

/**
 * Under Nitro on Cloudflare, the Worker `vars`/bindings live on `globalThis.__env__`,
 * not always on the `env` handed to the Hono context. Merge both so env-driven flags
 * (ENVIRONMENT, MOCK_OTP, DEMO_LOGINS_ENABLED, CRON_SECRET, VAPID_*) resolve correctly.
 */
export function effectiveEnv(env: ApiEnv): ApiEnv {
  const globalEnv = (globalThis as { __env__?: ApiEnv }).__env__;
  if (!globalEnv) return env;
  return { ...globalEnv, ...env } as ApiEnv;
}

function secureCookies(env: ApiEnv) {
  return isSecureCookieEnv(effectiveEnv(env).ENVIRONMENT);
}

/**
 * Resolve the distributor a campaign viewer belongs to, for campaign scoping (prevents a dealer /
 * sales-exec from seeing another distributor's targeted campaign). Returns null when it can't be
 * determined, which the campaign queries treat as "global campaigns only".
 */
async function resolveDealerDistributorId(
  db: D1Database,
  user: { role: string; dealerId?: string | null; distributorId?: string | null; id: string },
): Promise<string | null> {
  if (user.distributorId) return user.distributorId;
  if (user.role === "dealer" && user.dealerId) {
    const row = await db
      .prepare(`SELECT distributor_id FROM dealers WHERE id = ? AND deleted_at IS NULL`)
      .bind(user.dealerId)
      .first<{ distributor_id: string | null }>();
    return row?.distributor_id ?? null;
  }
  if (user.role === "sales_executive") {
    const row = await db
      .prepare(
        `SELECT distributor_id FROM dealers
         WHERE sales_executive_user_id = ? AND deleted_at IS NULL AND distributor_id IS NOT NULL
         ORDER BY created_at LIMIT 1`,
      )
      .bind(user.id)
      .first<{ distributor_id: string | null }>();
    return row?.distributor_id ?? null;
  }
  return null;
}

function isAllowedRequestOrigin(origin: string, requestUrl: string, configuredOrigins?: string) {
  if (origin === new URL(requestUrl).origin) return true;
  const allowed = new Set(
    (configuredOrigins ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  return allowed.has(origin);
}

async function enforceOtpRateLimits(env: ApiEnv, ip: string, normalizedPhone: string) {
  const checks = await Promise.all([
    env.OTP_IP_RATE_LIMITER?.limit({ key: ip }),
    env.OTP_PHONE_RATE_LIMITER?.limit({ key: normalizedPhone }),
  ]);
  if (checks.some((result) => result?.success === false)) {
    throw new AppError("Too many OTP requests. Please try again shortly.", 429, "OTP_RATE_LIMITED");
  }
}

async function enforceOtpVerifyRateLimits(env: ApiEnv, ip: string, normalizedPhone: string) {
  const checks = await Promise.all([
    env.OTP_IP_RATE_LIMITER?.limit({ key: `verify:${ip}` }),
    env.OTP_PHONE_RATE_LIMITER?.limit({ key: `verify:${normalizedPhone}` }),
  ]);
  if (checks.some((result) => result?.success === false)) {
    throw new AppError("Too many OTP attempts. Please try again shortly.", 429, "OTP_RATE_LIMITED");
  }
}

function requireInternalSecret(c: { env: ApiEnv; req: { header: (name: string) => string | undefined } }) {
  const secret = effectiveEnv(c.env).CRON_SECRET;
  if (!secret) return { ok: false as const, status: 503 as const, error: "Internal endpoints not configured" };
  if (c.req.header("x-cron-secret") !== secret) {
    return { ok: false as const, status: 401 as const, error: "Unauthorized" };
  }
  return { ok: true as const };
}

app.use("/api/v1/*", async (c, next) => {
  // Use the merged env: under Nitro on Cloudflare the Worker secrets (incl. VAPID_*) live on
  // globalThis.__env__, not always on the raw c.env. The push send path reads getPushEnv(),
  // so it must receive the merged env or VAPID keys resolve to null.
  setPushEnv(effectiveEnv(c.env));
  // Configure the standard-size pricing buffer from env (defaults to 1" if unset). Lets the
  // buffer be changed later via a STANDARD_SIZE_BUFFER_IN var without a code change.
  configureStandardSizeBuffer(effectiveEnv(c.env) as { STANDARD_SIZE_BUFFER_IN?: string | number | null });
  await getRequestDb(c);
  await next();
});

app.use("/api/v1/*", async (c, next) => {
  const origin = c.req.header("origin");
  if (origin && !isAllowedRequestOrigin(origin, c.req.url, c.env.ALLOWED_ORIGINS)) {
    return c.json({ error: "Origin not allowed" }, 403);
  }
  await next();
});

app.use(
  "/api/v1/*",
  cors({
    origin: (origin, c) =>
      isAllowedRequestOrigin(origin, c.req.url, (c.env as ApiEnv).ALLOWED_ORIGINS)
        ? origin
        : undefined,
    credentials: true,
  }),
);

app.onError((err, c) => {
  if (err instanceof AppError) {
    if (err.statusCode >= 500) console.error(err);
    return c.json({ error: err.message, ...(err.code ? { code: err.code } : {}) }, err.statusCode);
  }
  const message = err instanceof Error ? err.message : "Request failed";
  console.error(err);
  return c.json({ error: message }, 500);
});


app.get("/api/v1/health", (c) => c.json({ ok: true }));

// Public, unauthenticated config the login screen needs before sign-in. Exposes only whether the
// server is running in demo mode (MOCK_OTP / DEMO_LOGINS_ENABLED) so the login page can show the
// one-tap demo-login buttons on any environment that actually accepts demo logins — without
// relying on a build-time VITE flag that must be remembered at deploy time.
app.get("/api/v1/config/public", (c) => {
  return c.json({ demoLoginsEnabled: isDemoModeEnabled(effectiveEnv(c.env)) });
});

// Auth
app.post("/api/v1/auth/otp/request", async (c) => {
  const body = await c.req.json<{ phone: string }>();
  const normalizedPhone = normalizePhone(body.phone);
  const ip = c.req.header("cf-connecting-ip") ?? "unknown";
  await enforceOtpRateLimits(c.env, ip, normalizedPhone);
  const db = await getRequestDb(c);
  const result = await requestOtp(db, normalizedPhone, effectiveEnv(c.env));
  return c.json(result);
});

app.post("/api/v1/auth/otp/verify", async (c) => {
  const body = await c.req.json<{ phone: string; code: string }>();
  const normalizedPhone = normalizePhone(body.phone);
  const ip = c.req.header("cf-connecting-ip") ?? "unknown";
  await enforceOtpVerifyRateLimits(c.env, ip, normalizedPhone);
  const db = await getRequestDb(c);
  const userRow = await verifyOtp(db, body.phone, body.code);
  const sessionId = newSessionId(); // M-5: 128-bit high-entropy session token
  const tokenHash = await sha256(sessionId);
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  await db
    .prepare(
      `INSERT INTO sessions (id, user_id, token_hash, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(sessionId, userRow['id'], tokenHash, expires, c.req.header("cf-connecting-ip") ?? null, c.req.header("user-agent") ?? null)
    .run();

  const effectiveRole = await resolveEffectiveRole(
    db,
    userRow['id'] as string,
    userRow['role'] as AppVariables["user"]["role"],
  );
  const user = buildSessionUser({
    id: userRow['id'] as string,
    name: userRow['name'] as string,
    phone: userRow['phone'] as string,
    role: effectiveRole,
    status: userRow['status'] as AppVariables["user"]["status"],
    dealer_id: userRow['dealer_id'] as string | null,
    distributor_id: userRow['distributor_id'] as string | null,
  });

  const secure = secureCookies(c.env);
  c.header("Set-Cookie", setSessionCookie(sessionId, secure), { append: true });
  c.header("Set-Cookie", setSessionPresentCookie(secure), { append: true });
  return c.json({ user }, 200);
});

app.post("/api/v1/auth/logout", requireAuth, async (c) => {
  const db = await getRequestDb(c);
  await db.prepare(`DELETE FROM sessions WHERE id = ?`).bind(c.get("sessionId")).run();
  const secure = secureCookies(c.env);
  c.header("Set-Cookie", clearSessionCookie(secure), { append: true });
  c.header("Set-Cookie", clearSessionPresentCookie(secure), { append: true });
  return c.json({ ok: true }, 200);
});

app.get("/api/v1/auth/me", requireAuth, (c) => c.json({ user: c.get("user") }));

app.post("/api/v1/auth/demo-login", async (c) => {
  if (!isDemoModeEnabled(effectiveEnv(c.env))) {
    throw new AppError("Demo login is not enabled", 403);
  }
  const body = await c.req.json<{ phone: string }>();
  const db = await getRequestDb(c);
  try {
    const userRow = await resolveDemoLoginUser(db, body.phone);
    const { user, sessionId } = await createSessionForUserRow(db, userRow, {
      ip: c.req.header("cf-connecting-ip") ?? null,
      userAgent: c.req.header("user-agent") ?? null,
    });
    const secure = secureCookies(c.env);
    c.header("Set-Cookie", setSessionCookie(sessionId, secure), { append: true });
    c.header("Set-Cookie", setSessionPresentCookie(secure), { append: true });
    return c.json({ user }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Demo login failed";
    if (message === "DEMO_LOGIN_NOT_ALLOWED") throw new AppError("Demo login is not allowed for this number", 403);
    if (message === "PHONE_NOT_REGISTERED") throw new AppError("Phone not registered", 404);
    throw err;
  }
});

// Catalog
function mapCatalogProductWithPricing(row: Record<string, unknown>) {
  const {
    price_mrp,
    price_dealer,
    price_points,
    price_reward_percent,
    price_free_items,
    default_thickness,
    campaign_id,
    campaign_name,
    campaign_badge_label,
    campaign_discount_percent,
    campaign_description,
    campaign_terms,
    campaign_start_at,
    campaign_end_at,
    ...product
  } = row;
  if (price_mrp == null || price_dealer == null) {
    throw new Error(`Price not found for product ${String(product['id'])}`);
  }

  // Mattress catalog cards preview the base-size price (scaled by the default thickness). Pillows
  // and foldables have a FIXED, exact MRP/dealer price — never scaled by thickness or size — so use
  // the stored values verbatim for them (a foldable has a default thickness, but it must NOT scale
  // its exact MRP).
  const sized = isMattressCategory(String(product["category"] ?? ""))
    ? applyMattressPricing(Number(price_mrp), Number(price_dealer), {
        thickness: default_thickness as string | undefined,
      })
    : { factor: 1, mrp: Number(price_mrp), dealerPrice: Number(price_dealer) };
  const rawDiscountPercent = campaign_id ? Number(campaign_discount_percent ?? 0) : null;
  const rawCampaignPrice =
    campaign_id && rawDiscountPercent != null
      ? getCampaignPrice(sized.dealerPrice, rawDiscountPercent)
      : null;
  // A campaign only counts when it actually reduces the dealer price. Ignore 0% (or
  // non-discounting) campaigns so no phantom badge / strike-through / "0% off" is shown.
  const hasRealDiscount = rawCampaignPrice != null && rawCampaignPrice < sized.dealerPrice;
  const discountPercent = hasRealDiscount ? rawDiscountPercent : null;
  const campaignPrice = hasRealDiscount ? rawCampaignPrice : null;
  const rewardPercent = Number(price_reward_percent ?? 0);
  const calculatedPoints = calculateRewardPoints(sized.dealerPrice, rewardPercent, 1);

  return {
    ...product,
    id: String(product['id'] ?? ""),
    category: String(product['category'] ?? ""),
    mrp: sized.mrp,
    price: sized.dealerPrice,
    points: price_points == null ? calculatedPoints : Number(price_points),
    free: (price_free_items as string | null) ?? null,
    campaign: hasRealDiscount
      ? {
          id: campaign_id,
          name: campaign_name,
          badgeLabel: campaign_badge_label,
          discountPercent,
          description: campaign_description,
          terms: campaign_terms,
          startAt: campaign_start_at,
          endAt: campaign_end_at,
        }
      : null,
    campaignPrice,
    unitPrice: campaignPrice ?? sized.dealerPrice,
  };
}

app.get("/api/v1/catalog", requireAuth, requireActiveAccount, requirePermission("catalog:read"), async (c) => {
  const db = await getRequestDb(c);
  const layers = await db.prepare(`SELECT * FROM product_layers ORDER BY sort_order`).all();
  const layerItems = await db.prepare(`SELECT * FROM product_layer_items ORDER BY sort_order`).all();
  const today = istTodayIso();
  const products = await db
    .prepare(
      `WITH ranked_prices AS (
         SELECT pp.*,
           ROW_NUMBER() OVER (PARTITION BY pp.product_id ORDER BY pp.effective_from DESC, pp.id DESC) AS rn
         FROM product_prices pp
       ),
       ranked_thicknesses AS (
         SELECT pt.*,
           ROW_NUMBER() OVER (PARTITION BY pt.product_id ORDER BY pt.sort_order ASC, pt.id ASC) AS rn
         FROM product_thicknesses pt
       ),
       active_campaigns AS (
         SELECT pc.*
         FROM price_campaigns pc
         WHERE pc.deleted_at IS NULL
           AND date(pc.start_at) <= date(?)
           AND date(pc.end_at) >= date(?)
       ),
       ranked_campaigns AS (
         SELECT p.id AS join_product_id, ac.*,
           -- A campaign is "specific" to this product when it targets it via the legacy product_id
           -- OR the multi-product join table; those outrank an all-products (NULL) campaign.
           CASE WHEN ac.product_id = p.id OR ac.id IN (
             SELECT campaign_id FROM price_campaign_products WHERE product_id = p.id
           ) THEN 0 ELSE 1 END AS is_all_products
         FROM products p
         JOIN active_campaigns ac ON (
           ac.product_id = p.id OR ac.product_id IS NULL
           OR ac.id IN (SELECT campaign_id FROM price_campaign_products WHERE product_id = p.id)
         )
       ),
       ranked_campaigns_final AS (
         SELECT rc.*,
           ROW_NUMBER() OVER (
             PARTITION BY rc.join_product_id
             ORDER BY rc.is_all_products ASC, rc.start_at DESC, rc.id DESC
           ) AS rn
         FROM ranked_campaigns rc
       )
       SELECT
         p.*,
         pp.mrp AS price_mrp,
         pp.dealer_price AS price_dealer,
         pp.points AS price_points,
         pp.reward_percent AS price_reward_percent,
         pp.free_items_label AS price_free_items,
         pt.thickness AS default_thickness,
         pc.id AS campaign_id,
         pc.name AS campaign_name,
         pc.badge_label AS campaign_badge_label,
         pc.discount_percent AS campaign_discount_percent,
         pc.description AS campaign_description,
         pc.terms AS campaign_terms,
         pc.start_at AS campaign_start_at,
         pc.end_at AS campaign_end_at
       FROM products p
       LEFT JOIN ranked_prices pp ON pp.product_id = p.id AND pp.rn = 1
       LEFT JOIN ranked_thicknesses pt ON pt.product_id = p.id AND pt.rn = 1
       LEFT JOIN ranked_campaigns_final pc ON pc.join_product_id = p.id AND pc.rn = 1
       WHERE p.deleted_at IS NULL AND p.active = 1
       ORDER BY p.sort_order`,
    )
    .bind(today, today)
    .all();

  // Hide mattresses that don't have a complete set of per-thickness ₹/sqft rates: a mattress
  // without pricing must not be shown to dealers (it can't be quoted). Non-mattresses always pass.
  const allThicknesses = await db
    .prepare(`SELECT product_id, thickness FROM product_thicknesses`)
    .all<{ product_id: string; thickness: string }>();
  const thicknessesByProduct = new Map<string, string[]>();
  for (const row of allThicknesses.results) {
    if (!thicknessesByProduct.has(row.product_id)) thicknessesByProduct.set(row.product_id, []);
    thicknessesByProduct.get(row.product_id)!.push(row.thickness);
  }
  const showableIds = await completeProductIds(
    db,
    products.results.map((p) => ({
      id: p['id'] as string,
      category: p['category'] as string,
      thicknesses: thicknessesByProduct.get(p['id'] as string) ?? [],
    })),
  );

  const pricedProducts = products.results
    .filter((p) => showableIds.has(p['id'] as string))
    .map(mapCatalogProductWithPricing);

  const mattressLayers = layers.results.map((layer) => {
    const items = layerItems.results.filter((i) => i['layer_id'] === layer['id']);
    const subgroups = [...new Set(items.map((i) => i['subgroup_label']).filter(Boolean))];
    if (subgroups.length) {
      return {
        id: layer['id'],
        title: layer['title'],
        subgroups: subgroups.map((label) => ({
          label,
          productIds: items.filter((i) => i['subgroup_label'] === label).map((i) => i['product_id']),
        })),
      };
    }
    return {
      id: layer['id'],
      title: layer['title'],
      productIds: items.map((i) => i['product_id']),
    };
  });

  const foldable = pricedProducts.filter((p) => p.category === "Foldable");
  const pillowProducts = pricedProducts.filter((p) => p.category === "Pillows");

  return c.json({ mattressLayers, foldable, pillows: pillowProducts, products: pricedProducts });
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

  // A mattress without a complete set of per-thickness ₹/sqft rates isn't viewable (can't price).
  const showable = await completeProductIds(db, [
    {
      id: productId,
      category: product['category'] as string,
      thicknesses: thicknesses.results.map((t) => t['thickness'] as string),
    },
  ]);
  if (!showable.has(productId)) return c.json({ error: "Not found" }, 404);
  const price = await db
    .prepare(`SELECT * FROM product_prices WHERE product_id = ? ORDER BY effective_from DESC LIMIT 1`)
    .bind(productId)
    .first();
  const campaignId = c.req.query("campaignId");
  const viewer = c.get("user");
  const quote = await buildPriceQuote(db, {
    productId,
    quantity: 1,
    campaignId: campaignId || undefined,
    dealerId: viewer?.dealerId,
    distributorId: viewer?.distributorId,
  });

  return c.json({
    ...product,
    thicknesses: thicknesses.results.map((t) => t['thickness']),
    mrp: quote.mrp,
    price: quote.dealerPrice,
    points: price?.['points'],
    free: price?.['free_items_label'],
    campaign: quote.campaign,
    campaignPrice: quote.campaignPrice,
    unitPrice: quote.unitPrice,
  });
});

app.post("/api/v1/catalog/price-quote", requireAuth, requireActiveAccount, requirePermission("catalog:read"), async (c) => {
  const body = await c.req.json<{
    productId: string;
    quantity: number;
    thickness?: string;
    campaignId?: string;
    lengthIn?: number;
    breadthIn?: number;
    freeItemWidthIn?: number;
  }>();
  const db = await getRequestDb(c);
  const viewer = c.get("user");
  try {
    const quote = await buildPriceQuote(db, {
      ...body,
      dealerId: viewer?.dealerId,
      distributorId: viewer?.distributorId,
    });
    return c.json(quote);
  } catch (error) {
    // H-2: a mattress quoted WITH a size + thickness but no configured sqft rate -> 422 (never fall
    // back to a base price). The no-dimensions catalog "from" preview path is unaffected.
    if (error instanceof Error && error.message === "Mattress sq.ft price not set") {
      return c.json({ error: error.message }, 422);
    }
    throw error;
  }
});

// Orders
app.post("/api/v1/orders", requireAuth, requireActiveAccount, requirePermission("orders:create"), async (c) => {
  const db = await getRequestDb(c);
  const body = await c.req.json();
  try {
    const order = await createOrder(db, c.get("user"), body, c.env);
    return c.json(order, 201);
  } catch (error) {
    // H-2: mattress size/thickness missing, or no configured sqft rate for the chosen thickness -> 422.
    if (
      error instanceof OrderValidationError ||
      (error instanceof Error && error.message === "Mattress sq.ft price not set")
    ) {
      return c.json({ error: error instanceof Error ? error.message : "Invalid order" }, 422);
    }
    throw error;
  }
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
    ...(user.role === "dealer" && user.dealerId ? { dealerIds: [user.dealerId] } : {}),
    ...(user.role === "distributor" && user.distributorId ? { distributorId: user.distributorId } : {}),
    ...(user.role === "sales_executive" ? { salesExecutiveUserId: user.id } : {}),
  };

  if (user.role === "dealer" && !user.dealerId) {
    if (page || pageSize) {
      return c.json({
        items: [],
        total: 0,
        summary: { totalSales: 0, totalPoints: 0 },
        page: 1,
        pageSize: Number(pageSize) || 50,
        totalPages: 1,
      });
    }
    return c.json([]);
  }
  return c.json(await listOrders(db, opts));
});

app.get("/api/v1/orders/status-counts", requireAuth, requireActiveAccount, requirePermission("orders:read"), async (c) => {
  const db = await getRequestDb(c);
  const user = c.get("user");
  // Apply the SAME date window as the list so the badge counts match what's shown. Omitted (no
  // fromDate/toDate) means all-time, matching the "all" period.
  const fromDate = c.req.query("fromDate");
  const toDate = c.req.query("toDate");
  const scopeOpts = {
    ...(fromDate ? { fromDate } : {}),
    ...(toDate ? { toDate } : {}),
    ...(user.role === "dealer" && user.dealerId ? { dealerIds: [user.dealerId] } : {}),
    ...(user.role === "distributor" && user.distributorId ? { distributorId: user.distributorId } : {}),
    ...(user.role === "sales_executive" ? { salesExecutiveUserId: user.id } : {}),
  };
  if (user.role === "dealer" && !user.dealerId) {
    return c.json({ pending: 0, approved: 0, in_making: 0, out_for_delivery: 0, delivered: 0, rejected: 0, cancelled: 0, all: 0 });
  }
  return c.json(await getOrderStatusCounts(db, scopeOpts));
});

app.get("/api/v1/orders/:id", requireAuth, requireActiveAccount, requirePermission("orders:read"), async (c) => {
  const db = await getRequestDb(c);
  const orderId = c.req.param("id");
  if (!(await canAccessOrder(db, c.get("user"), orderId))) return c.json({ error: "Forbidden" }, 403);
  const order = await getOrderById(db, orderId);
  if (!order) return c.json({ error: "Not found" }, 404);
  return c.json(order);
});

app.patch("/api/v1/orders/:id/items", requireAuth, requireActiveAccount, requirePermission("orders:create"), async (c) => {
  const db = await getRequestDb(c);
  const orderId = c.req.param("id");
  if (!(await canAccessOrder(db, c.get("user"), orderId))) return c.json({ error: "Forbidden" }, 403);
  try {
    const body = await c.req.json();
    const order = await updateOrderLineItems(db, orderId, c.get("user"), body);
    return c.json(order);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not update order";
    return c.json({ error: message }, 400);
  }
});

app.post("/api/v1/orders/:id/approve", requireAuth, requireActiveAccount, requirePermission("orders:approve"), async (c) => {
  const db = await getRequestDb(c);
  const orderId = c.req.param("id");
  if (!(await canAccessOrder(db, c.get("user"), orderId))) return c.json({ error: "Forbidden" }, 403);
  const order = await approveOrder(db, orderId, c.get("user"), c.env);
  return c.json(order);
});

app.patch(
  "/api/v1/orders/:id/status",
  requireAuth,
  requireActiveAccount,
  requireAnyPermission("orders:approve", "orders:status:fulfillment", "orders:deliver"),
  async (c) => {
  const db = await getRequestDb(c);
  const orderId = c.req.param("id");
  const body = await c.req.json<{ status: string }>();
  if (!(await canAccessOrder(db, c.get("user"), orderId))) return c.json({ error: "Forbidden" }, 403);
  const user = c.get("user");
  const status = body.status as import("./order-status").OrderStatus;

  if (status === "rejected") {
    return c.json({ error: "Use POST /api/v1/orders/:id/reject to reject orders" }, 400);
  }

  const fulfillmentStatuses: import("./order-status").OrderStatus[] = [
    "in_making",
    "out_for_delivery",
    "delivered",
  ];
  if (user.role !== "master_admin") {
    if (status === "approved") {
      if (!user.permissions.includes("orders:approve")) return c.json({ error: "Forbidden" }, 403);
    } else if (status === "delivered") {
      if (
        !user.permissions.includes("orders:status:fulfillment") &&
        !user.permissions.includes("orders:deliver")
      ) {
        return c.json({ error: "Forbidden" }, 403);
      }
    } else if (fulfillmentStatuses.includes(status)) {
      if (!user.permissions.includes("orders:status:fulfillment")) {
        return c.json({ error: "Forbidden" }, 403);
      }
    } else {
      return c.json({ error: "Forbidden" }, 403);
    }
  }

  try {
    const order = await updateOrderStatus(db, orderId, status, user, c.env);
    return c.json(order);
  } catch (error) {
    // P0-6: a state-machine violation is a 422 (unprocessable); other failures stay 400 as before.
    if (error instanceof InvalidStatusTransitionError) {
      return c.json({ error: error.message }, 422);
    }
    return c.json(
      { error: error instanceof Error ? error.message : "Could not update order status" },
      400,
    );
  }
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
  try {
    const order = await rejectOrder(db, orderId, body.reason.trim(), c.get("user"), c.env);
    return c.json(order);
  } catch (err) {
    if (err instanceof OrderConflictError) return c.json({ error: err.message }, 409);
    throw err;
  }
});

app.post("/api/v1/orders/:id/cancel", requireAuth, requireActiveAccount, requirePermission("orders:cancel"), async (c) => {
  const db = await getRequestDb(c);
  const orderId = c.req.param("id");
  const body = await c.req.json<{ reason?: string }>().catch(() => ({ reason: undefined }));
  if (!(await canAccessOrder(db, c.get("user"), orderId))) return c.json({ error: "Forbidden" }, 403);
  try {
    const order = await cancelApprovedOrder(db, orderId, c.get("user"), body.reason);
    return c.json(order);
  } catch (err) {
    if (err instanceof OrderConflictError) return c.json({ error: err.message }, 409);
    throw err;
  }
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
  const activeFilter = c.req.query("active");
  const sort = c.req.query("sort") ?? "name";

  let sql = `SELECT * FROM dealers WHERE deleted_at IS NULL`;
  const binds: unknown[] = [];
  sql += appendUserDealerScopeSql(user, "id", binds);
  if (activeFilter === "active") {
    sql += ` AND active = 1`;
  } else if (activeFilter === "inactive") {
    sql += ` AND active = 0`;
  }
  if (search) {
    sql += ` AND (store_name LIKE ? OR code LIKE ? OR location LIKE ?)`;
    const q = `%${search}%`;
    binds.push(q, q, q);
  }
  if (sort === "area") {
    sql += ` ORDER BY location ASC, store_name ASC`;
  } else {
    sql += ` ORDER BY store_name ASC`;
  }
  const { results } = await db.prepare(sql).bind(...binds).all();
  return c.json(await mapDealerRows(db, results as Record<string, unknown>[]));
});

app.get("/api/v1/dealers/:id", requireAuth, requireActiveAccount, requireAnyPermission("dealers:read", "orders:read"), async (c) => {
  const db = await getRequestDb(c);
  const dealerId = c.req.param("id");
  if (!(await canAccessDealer(db, c.get("user"), dealerId))) return c.json({ error: "Forbidden" }, 403);
  const row = await db.prepare(`SELECT * FROM dealers WHERE id = ?`).bind(dealerId).first();
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(await mapDealerRow(db, row));
});

app.get("/api/v1/dealers/:id/performance", requireAuth, requireActiveAccount, requireAnyPermission("dealers:read", "orders:read"), async (c) => {
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
      id: r['id'],
      dealerId: r['dealer_id'],
      name: r['name'],
      emoji: r['emoji'],
      points: r['points_spent'],
      claimedAt: formatInLabel(String(r['claimed_at'] ?? "")),
      status: r['status'],
      deliveredAt: r['delivered_at'] ? formatInLabel(String(r['delivered_at'])) : null,
    })),
  );
});

// 360° per-dealer rewards view for the admin Dealer Profile: points summary + full ledger (with
// order references so earned rows link back to their order) + claim history. Reuses points_ledger
// and reward_claims (no new storage). Gated rewards:read + canAccessDealer.
app.get("/api/v1/dealers/:id/rewards", requireAuth, requireActiveAccount, requirePermission("rewards:read"), async (c) => {
  const db = await getRequestDb(c);
  const dealerId = c.req.param("id");
  if (!(await canAccessDealer(db, c.get("user"), dealerId))) return c.json({ error: "Forbidden" }, 403);
  return c.json(await loadDealerRewards(db, dealerId));
});

// Unified chronological activity feed (orders + points + claims + visits) for the profile Overview.
// Reuses existing tables. Gated dealers:read + canAccessDealer.
app.get("/api/v1/dealers/:id/activity", requireAuth, requireActiveAccount, requirePermission("dealers:read"), async (c) => {
  const db = await getRequestDb(c);
  const dealerId = c.req.param("id");
  if (!(await canAccessDealer(db, c.get("user"), dealerId))) return c.json({ error: "Forbidden" }, 403);
  return c.json(await loadDealerActivity(db, dealerId));
});

// Campaigns
app.get("/api/v1/campaigns", requireAuth, requireActiveAccount, requirePermission("campaigns:read"), async (c) => {
  const db = await getRequestDb(c);
  const user = c.get("user");
  const tab = (c.req.query("tab") ?? "active") as "active" | "upcoming" | "expired";
  // Scope campaigns to the dealer's distributor so they never see another distributor's targeted
  // campaign. Resolve the dealer's distributor_id from their dealer store.
  const distributorId = await resolveDealerDistributorId(db, user);
  const campaigns = await listDealerCampaigns(db, tab, distributorId);
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
  if (user.role === "sales_executive") {
    const seDistributorId = await resolveDealerDistributorId(db, user);
    const campaigns = await listDealerCampaigns(db, tab ?? "active", seDistributorId);
    return c.json(
      campaigns.map((campaign) => ({
        id: campaign.id,
        distributorId: "",
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
  }
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
  const hasKind = await hasRewardKindColumn(db);
  // `light=1` omits the base64 image_url column. Reward images are stored inline as data URLs, so
  // the full catalog can be hundreds of KB; the home rewards bar and product page only need
  // id/name/emoji/points to compute progress, so they request the light variant to avoid pulling a
  // large payload on every load. The full rewards page (which renders images) omits the flag.
  const light = c.req.query("light") === "1";
  const columns = light
    ? `id, name, emoji, points_required`
    : `id, name, emoji, points_required, image_url`;
  const { results } = await db
    .prepare(
      `SELECT ${columns} FROM reward_catalog WHERE deleted_at IS NULL AND active = 1 ${standardCatalogSqlFilter(hasKind)}`,
    )
    .all();
  return c.json(
    results.map((r) => ({
      id: r['id'],
      name: r['name'],
      emoji: r['emoji'],
      points: coerceRewardPoints(r['points_required'], 0),
      imageUrl: light ? undefined : ((r['image_url'] as string) ?? undefined),
    })),
  );
});

app.get("/api/v1/rewards/additional", requireAuth, requireActiveAccount, requirePermission("rewards:read"), async (c) => {
  const db = await getRequestDb(c);
  const user = c.get("user");
  if (!user.dealerId) return c.json({ lifetimeEarned: 0, claimed: null, items: [] });
  return c.json(await listAdditionalRewardsForDealer(db, user.dealerId));
});

app.get("/api/v1/rewards/balance", requireAuth, requireActiveAccount, requirePermission("rewards:read"), async (c) => {
  const db = await getRequestDb(c);
  const user = c.get("user");
  if (!user.dealerId) return c.json({ balance: 0, nextRewardAt: 3000 });
  const balance = await getDealerPointsBalance(db, user.dealerId);
  const nextRewardAt = await getNextRewardThreshold(db, balance);
  return c.json({ balance, nextRewardAt });
});

app.get("/api/v1/rewards/ledger", requireAuth, requireActiveAccount, requirePermission("rewards:read"), async (c) => {
  const db = await getRequestDb(c);
  const user = c.get("user");
  if (!user.dealerId) return c.json([]);
  const { results } = await db
    .prepare(`SELECT label, delta as value, occurred_at as date FROM points_ledger WHERE dealer_id = ? ORDER BY occurred_at DESC LIMIT 50`)
    .bind(user.dealerId)
    .all();
  return c.json(
    results.map((r) => {
      const raw = Number(r['value']);
      const magnitude = coerceRewardPoints(Math.abs(raw), 0);
      return {
        label: r['label'],
        value: raw < 0 ? -magnitude : magnitude,
        date: formatInLabel(String(r['date'] ?? "")),
      };
    }),
  );
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
      id: r['id'],
      name: r['name'],
      emoji: r['emoji'],
      claimed: formatInLabel(String(r['claimed_at'] ?? "")),
      status: r['status'],
      delivered: r['delivered_at'] ? formatInLabel(String(r['delivered_at'])) : undefined,
    })),
  );
});

app.post("/api/v1/rewards/claims", requireAuth, requireActiveAccount, requirePermission("rewards:redeem"), async (c) => {
  const db = await getRequestDb(c);
  const user = c.get("user");
  if (!user.dealerId) return c.json({ error: "Dealer required" }, 400);
  const body = await c.req.json<{ rewardId: string }>();
  const reward = await db
    .prepare(
      `SELECT * FROM reward_catalog WHERE id = ? AND active = 1 AND deleted_at IS NULL`,
    )
    .bind(body.rewardId)
    .first<{
    id: string;
    name: string;
    emoji: string;
    points_required: number;
    kind?: string;
  }>();
  if (!reward) return c.json({ error: "Reward not found" }, 404);

  try {
    const dealer = await db
      .prepare(`SELECT store_name, distributor_id FROM dealers WHERE id = ?`)
      .bind(user.dealerId)
      .first<{ store_name: string; distributor_id: string }>();
    const distributorId = dealer?.distributor_id ?? null;

    const isMilestone = String(reward.kind ?? "standard") === "milestone";
    const { claimId } = isMilestone
      ? await redeemAdditionalReward(db, user.dealerId, reward, distributorId)
      : await redeemRewardClaim(db, user.dealerId, reward, distributorId);

    await notifyRewardClaim(db, {
      claimId,
      dealerId: user.dealerId,
      dealerName: dealer?.store_name ?? "Dealer",
      distributorId: dealer?.distributor_id ?? "",
      rewardName: reward.name,
      pointsRequired: reward.points_required,
    });

    return c.json({ id: claimId, status: "pending_approval" }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Redemption failed";
    if (message.includes("Insufficient") || message.includes("lifetime") || message.includes("already chose")) {
      return c.json({ error: message }, 400);
    }
    throw err;
  }
});

// ── Reward Claim workflow (separate from Orders) ─────────────────────────────────────────────
// One unified, role-scoped surface used by dealer / distributor / sales exec / admin / admin staff.
// Read is gated on rewards:read (every relevant role has it); the list/detail are scoped per role
// inside the service (dealer -> own, distributor/sales-exec -> their dealers, full-access -> all).
// Transitions are authorized per-role inside advanceRewardClaimStatus using the shared transition
// table, so a single endpoint safely serves distributor approve/reject/deliver and admin-staff
// process/dispatch.

app.get("/api/v1/reward-claims", requireAuth, requireActiveAccount, requirePermission("rewards:read"), async (c) => {
  const db = await getRequestDb(c);
  const user = c.get("user");
  return c.json(
    await listRewardClaimsScoped(db, user, {
      status: c.req.query("status"),
      search: c.req.query("search"),
      page: Number(c.req.query("page") ?? 1),
      pageSize: Number(c.req.query("pageSize") ?? 20),
    }),
  );
});

app.get("/api/v1/reward-claims/:id", requireAuth, requireActiveAccount, requirePermission("rewards:read"), async (c) => {
  const db = await getRequestDb(c);
  const user = c.get("user");
  const detail = await getRewardClaimDetail(db, c.req.param("id"));
  if (!detail) return c.json({ error: "Claim not found" }, 404);
  // Authorize read by scope: dealer -> own, distributor/sales-exec -> their dealer, full-access -> any.
  if (user.role === "dealer" && detail.dealerId !== user.dealerId) {
    return c.json({ error: "Forbidden" }, 403);
  }
  if (
    (user.role === "distributor" || user.role === "sales_executive") &&
    !(await canAccessDealer(db, user, detail.dealerId))
  ) {
    return c.json({ error: "Forbidden" }, 403);
  }
  return c.json(detail);
});

app.post("/api/v1/reward-claims/:id/transition", requireAuth, requireActiveAccount, requirePermission("rewards:read"), async (c) => {
  const db = await getRequestDb(c);
  const user = c.get("user");
  const body = await c.req.json<{ toStatus: string; reason?: string }>();
  const toStatus = String(body.toStatus ?? "");
  if (!(REWARD_CLAIM_STATUSES as readonly string[]).includes(toStatus)) {
    return c.json({ error: "Invalid target status" }, 400);
  }
  try {
    const result = await advanceRewardClaimStatus(
      db,
      c.req.param("id"),
      toStatus as RewardClaimStatus,
      user,
      { reason: body.reason },
    );
    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transition failed";
    // Business/validation errors -> 400; not-found -> 404; authorization -> 403.
    if (message.includes("not found")) return c.json({ error: message }, 404);
    if (message.includes("not allowed") || message.includes("not in your network")) {
      return c.json({ error: message }, 403);
    }
    return c.json({ error: message }, 400);
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
  const complaintNumber = await nextComplaintNumber(db);
  const ts = nowIso();
  await db
    .prepare(
      `INSERT INTO complaints (id, complaint_number, order_id, dealer_id, distributor_id, category, description, status, step, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?)`,
    )
    .bind(complaintId, complaintNumber, body.orderId, user.dealerId, order.distributor_id, body.category ?? "general", body.description, ts, ts)
    .run();

  await insertComplaintTimelineEvent(db, {
    complaintId,
    eventKey: "submitted",
    label: "Submitted",
    occurredAt: ts,
    actorUserId: user.id,
  });

  const dealer = await db
    .prepare(`SELECT store_name FROM dealers WHERE id = ?`)
    .bind(user.dealerId)
    .first<{ store_name: string }>();

  // Fan out complaint notifications in the background so the dealer's "need help" submit returns
  // immediately (the notify path does several recipient SELECTs + insert batches that aren't on the
  // user's critical path). On Workers this is tied to ctx.waitUntil so it still completes.
  const { ctx } = snapshotPushContext();
  runBackground(
    ctx,
    notifyComplaintCreated(db, {
      complaintId,
      orderId: body.orderId,
      distributorId: order.distributor_id,
      dealerName: dealer?.store_name ?? "Dealer",
    }),
  );

  return c.json({ id: complaintId, complaintNumber }, 201);
});

app.get("/api/v1/complaints", requireAuth, requireActiveAccount, requirePermission("complaints:read"), async (c) => {
  const db = await getRequestDb(c);
  const user = c.get("user");
  const binds: unknown[] = [];
  const scopeSql = appendUserDealerScopeSql(user, "c.dealer_id", binds);
  const countRow = await db
    .prepare(
      `SELECT COUNT(*) as c FROM complaints c JOIN dealers d ON d.id = c.dealer_id WHERE c.deleted_at IS NULL${scopeSql}`,
    )
    .bind(...binds)
    .first<{ c: number }>();

  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(c.req.query("pageSize") ?? 50)));
  const offset = (page - 1) * pageSize;

  const { results } = await db
    .prepare(
      `SELECT c.*, d.store_name as dealer_name FROM complaints c JOIN dealers d ON d.id = c.dealer_id WHERE c.deleted_at IS NULL${scopeSql} ORDER BY c.created_at DESC LIMIT ? OFFSET ?`,
    )
    .bind(...binds, pageSize, offset)
    .all();
  const items = results.map((row) => ({
    id: row['id'],
    complaintNumber: (row['complaint_number'] as string) ?? String(row['id']),
    orderId: row['order_id'],
    dealerId: row['dealer_id'],
    dealerName: row['dealer_name'],
    category: row['category'],
    description: row['description'],
    status: row['status'],
    createdAt: formatInLabel(String(row['created_at'] ?? "")),
    updatedAt: formatInLabel(String(row['updated_at'] ?? "")),
  }));
  return c.json({
    items,
    total: countRow?.c ?? 0,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil((countRow?.c ?? 0) / pageSize)),
  });
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

  const timeline = await listComplaintTimelineForApi(db, complaintId);
  const history =
    timeline.length > 0
      ? timeline
      : [
          { label: "Submitted", at: formatInLabel(String(row['created_at'] ?? "")) },
          ...(row['status'] !== "pending"
            ? [{
                label: "Status updated",
                at: formatInLabel(String(row['updated_at'] ?? "")),
                note: row['resolution_notes']
                  ? String(row['resolution_notes'])
                  : `Now ${String(row['status']).replace(/_/g, " ")}`,
              }]
            : []),
        ];

  return c.json({
    id: row['id'],
    complaintNumber: (row['complaint_number'] as string) ?? String(row['id']),
    orderId: row['order_id'],
    dealerId: row['dealer_id'],
    dealerName: row['dealer_name'],
    distributorName: row['distributor_name'],
    category: row['category'],
    description: row['description'],
    status: row['status'],
    resolutionNotes: (row['resolution_notes'] as string) ?? undefined,
    createdAt: formatInLabel(String(row['created_at'] ?? "")),
    updatedAt: formatInLabel(String(row['updated_at'] ?? "")),
    history,
  });
});

app.patch("/api/v1/complaints/:id", requireAuth, requireActiveAccount, requirePermission("complaints:update"), async (c) => {
  const db = await getRequestDb(c);
  const user = c.get("user");
  const complaintId = c.req.param("id");
  if (!(await canAccessComplaint(db, user, complaintId))) return c.json({ error: "Forbidden" }, 403);
  const body = await c.req.json<{ status: string; resolutionNotes?: string | null }>();
  if (!VALID_COMPLAINT_STATUSES.has(body.status)) {
    return c.json({ error: "Invalid complaint status" }, 400);
  }
  const complaint = await db
    .prepare(`SELECT dealer_id, order_id FROM complaints WHERE id = ?`)
    .bind(complaintId)
    .first<{ dealer_id: string; order_id: string }>();
  if (!complaint) return c.json({ error: "Not found" }, 404);

  const resolutionNotes =
    body.resolutionNotes !== undefined ? body.resolutionNotes?.trim() || null : undefined;
  const ts = nowIso();

  if (resolutionNotes !== undefined) {
    await db
      .prepare(`UPDATE complaints SET status = ?, resolution_notes = ?, updated_at = ? WHERE id = ?`)
      .bind(body.status, resolutionNotes, ts, complaintId)
      .run();
  } else {
    await db
      .prepare(`UPDATE complaints SET status = ?, updated_at = ? WHERE id = ?`)
      .bind(body.status, ts, complaintId)
      .run();
  }

  await insertComplaintTimelineEvent(db, {
    complaintId,
    eventKey: body.status,
    label: `Status: ${body.status.replace(/_/g, " ")}`,
    note: resolutionNotes ?? undefined,
    actorUserId: user.id,
    occurredAt: ts,
  });

  await notifyComplaintUpdated(db, {
    complaintId,
    dealerId: complaint.dealer_id,
    orderId: complaint.order_id,
    status: body.status,
  });

  return c.json({ ok: true });
});

// Dealer visits (Sales Executive check-in / check-out)
app.get("/api/v1/visits/active", requireAuth, requireActiveAccount, requirePermission("visits:read"), async (c) => {
  const db = await getRequestDb(c);
  const user = c.get("user");
  if (user.role !== "sales_executive") return c.json({ error: "Forbidden" }, 403);
  return c.json({ visit: await getActiveVisit(db, user.id) });
});

app.post("/api/v1/visits/check-in", requireAuth, requireActiveAccount, requirePermission("visits:create"), async (c) => {
  const db = await getRequestDb(c);
  const user = c.get("user");
  if (user.role !== "sales_executive") return c.json({ error: "Forbidden" }, 403);
  try {
    const body = await c.req.json<{
      dealerId?: string;
      dealerName?: string;
      storeName?: string;
      address?: string;
      mobile?: string;
      lat?: number | null;
      lng?: number | null;
    }>();
    const visit = await checkInVisit(db, user.id, body, user.id);
    return c.json(visit, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Check-in failed";
    return c.json({ error: message }, 400);
  }
});

app.post("/api/v1/visits/:id/check-out", requireAuth, requireActiveAccount, requirePermission("visits:create"), async (c) => {
  const db = await getRequestDb(c);
  const user = c.get("user");
  if (user.role !== "sales_executive") return c.json({ error: "Forbidden" }, 403);
  try {
    const body = await c.req.json<{ notes: string; lat?: number | null; lng?: number | null }>();
    const visit = await checkOutVisit(db, c.req.param("id"), user.id, body, user.id);
    return c.json(visit);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Check-out failed";
    return c.json({ error: message }, 400);
  }
});

app.get("/api/v1/visits", requireAuth, requireActiveAccount, requirePermission("visits:read"), async (c) => {
  const db = await getRequestDb(c);
  const user = c.get("user");
  if (user.role === "sales_executive") {
    return c.json(
      await listVisits(db, {
        salesExecutiveUserId: user.id,
        status: (c.req.query("status") as "active" | "completed" | "all") ?? "all",
        fromDate: c.req.query("fromDate"),
        toDate: c.req.query("toDate"),
        search: c.req.query("search"),
        page: Number(c.req.query("page") ?? 1),
        pageSize: Number(c.req.query("pageSize") ?? 20),
      }),
    );
  }
  if (user.role === "distributor" && user.distributorId) {
    // Optional SE / dealer sub-filters are ANDed WITH the distributor scope in listVisits, so a
    // distributor can only ever narrow within their own sales executives' visits — never see
    // another distributor's SE by passing an arbitrary id.
    return c.json(
      await listVisits(db, {
        distributorId: user.distributorId,
        salesExecutiveUserId: c.req.query("salesExecutiveUserId") || undefined,
        dealerId: c.req.query("dealerId") || undefined,
        status: (c.req.query("status") as "active" | "completed" | "all") ?? "all",
        fromDate: c.req.query("fromDate"),
        toDate: c.req.query("toDate"),
        search: c.req.query("search"),
        page: Number(c.req.query("page") ?? 1),
        pageSize: Number(c.req.query("pageSize") ?? 20),
      }),
    );
  }
  return c.json({ error: "Forbidden" }, 403);
});

app.get("/api/v1/visits/:id", requireAuth, requireActiveAccount, requirePermission("visits:read"), async (c) => {
  const db = await getRequestDb(c);
  const user = c.get("user");
  const visitId = c.req.param("id");
  let visit = null;
  if (user.role === "sales_executive") {
    visit = await getVisitById(db, visitId, user.id);
  } else if (user.role === "distributor" && user.distributorId) {
    visit = await getVisitById(db, visitId, undefined, user.distributorId);
  } else {
    return c.json({ error: "Forbidden" }, 403);
  }
  if (!visit) return c.json({ error: "Not found" }, 404);
  return c.json(visit);
});

// Notifications
app.get("/api/v1/notifications/vapid-public-key", async (c) => {
  const key = getVapidPublicKeyFromEnv(effectiveEnv(c.env));
  return c.json({ publicKey: key });
});

app.get("/api/v1/notifications/unread-count", requireAuth, requireActiveAccount, requirePermission("notifications:read"), async (c) => {
  const db = await getRequestDb(c);
  const count = await getUnreadNotificationCount(db, c.get("user").id);
  return c.json({ count });
});

app.get("/api/v1/notifications", requireAuth, requireActiveAccount, requirePermission("notifications:read"), async (c) => {
  const db = await getRequestDb(c);
  const since = c.req.query("since");
  return c.json(await listNotifications(db, c.get("user").id, since ? { since } : undefined));
});

app.post("/api/v1/notifications/push-subscribe", requireAuth, requireActiveAccount, requirePermission("notifications:read"), async (c) => {
  const db = await getRequestDb(c);
  const body = await c.req.json<{
    endpoint: string;
    keys: { p256dh: string; auth: string };
  }>();
  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return c.json({ error: "Invalid subscription" }, 400);
  }
  // Take-over upsert: the endpoint is always (re)assigned to the current user, whether it is new,
  // already owned by this user (idempotent success), or was previously owned by another account on
  // this same browser. No "registered to another account" rejection.
  const row = await savePushSubscription(db, c.get("user").id, body);
  return c.json(row, 201);
});

app.delete("/api/v1/notifications/push-subscribe", requireAuth, requireActiveAccount, requirePermission("notifications:read"), async (c) => {
  const db = await getRequestDb(c);
  const body = await c.req.json<{ endpoint: string }>();
  if (!body.endpoint) return c.json({ error: "endpoint required" }, 400);
  await deletePushSubscription(db, c.get("user").id, body.endpoint);
  return c.json({ ok: true });
});

// Server-truth push status for the current user: whether a subscription row actually exists
// (so the toggle reflects DB reality, not just browser permission) and whether push is
// demonstrably delivering. Used by the toggle mount check and the polling-fallback decision.
app.get("/api/v1/notifications/push-status", requireAuth, requireActiveAccount, requirePermission("notifications:read"), async (c) => {
  const db = await getRequestDb(c);
  return c.json(await getPushSubscriptionStatus(db, c.get("user").id));
});

app.patch("/api/v1/notifications/:id/read", requireAuth, requireActiveAccount, requirePermission("notifications:read"), async (c) => {
  const db = await getRequestDb(c);
  const result = await db
    .prepare(`UPDATE notifications SET read = 1 WHERE id = ? AND recipient_user_id = ?`)
    .bind(c.req.param("id"), c.get("user").id)
    .run();
  if (!result.meta.changes) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

app.post("/api/v1/notifications/read-all", requireAuth, requireActiveAccount, requirePermission("notifications:read"), async (c) => {
  const db = await getRequestDb(c);
  await db.prepare(`UPDATE notifications SET read = 1 WHERE recipient_user_id = ?`).bind(c.get("user").id).run();
  return c.json({ ok: true });
});

app.post("/api/v1/notifications/push-test", requireAuth, requireActiveAccount, requirePermission("notifications:read"), async (c) => {
  const vapid = getVapidPublicKeyFromEnv(effectiveEnv(c.env));
  if (!vapid) {
    return c.json(
      { error: "Web Push is not configured. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY." },
      503,
    );
  }
  const db = await getRequestDb(c);
  const user = c.get("user");
  const subscription = await db
    .prepare(`SELECT id FROM push_subscriptions WHERE user_id = ? LIMIT 1`)
    .bind(user.id)
    .first<{ id: string }>();
  if (!subscription) {
    return c.json({ error: "Enable push notifications on this device first." }, 400);
  }
  const link =
    user.role === "master_admin" || user.role === "admin_staff"
      ? "/admin/notifications"
      : user.role === "distributor" || user.role === "sales_executive"
        ? "/distributor/notifications"
        : "/home";
  const created = await createNotification(
    db,
    {
      recipientUserId: user.id,
      category: "system",
      type: "push_test",
      title: "Test notification",
      body: "Push is working. Tap to open your notification center.",
      link,
    },
    { skipPush: true },
  );
  // Send synchronously and report the real result, so a failed delivery surfaces here (and in
  // the tail) instead of dying silently in a background task. Uses the merged env so VAPID keys
  // resolve even when they live on globalThis.__env__.
  let result;
  try {
    result = await sendPushForNotifications(effectiveEnv(c.env), [created]);
  } catch (err) {
    console.error("[push] push-test send threw:", err instanceof Error ? err.stack ?? err.message : err);
    return c.json(
      { ok: false, error: err instanceof Error ? err.message : "Push send failed" },
      500,
    );
  }
  return c.json({ ok: true, ...result });
});

// Reports
app.get("/api/v1/reports/dashboard", requireAuth, requireActiveAccount, requirePermission("reports:read"), async (c) => {
  const db = await getRequestDb(c);
  const user = c.get("user");
  const reportScope = await resolveReportScope(db, user);
  if (!reportScope.allowed) return c.json({ error: "Forbidden" }, 403);

  const dealerBinds: unknown[] = [];
  const dealerFilter = appendUserDealerScopeSql(reportScope.user, "id", dealerBinds);

  const dealers = await db
    .prepare(`SELECT COUNT(*) as c FROM dealers WHERE deleted_at IS NULL${dealerFilter}`)
    .bind(...dealerBinds)
    .first<{ c: number }>();

  const activeBinds: unknown[] = [];
  const activeFilter = appendUserDealerScopeSql(reportScope.user, "id", activeBinds);
  const active = await db
    .prepare(`SELECT COUNT(*) as c FROM dealers WHERE deleted_at IS NULL AND active = 1${activeFilter}`)
    .bind(...activeBinds)
    .first<{ c: number }>();

  const orderBinds: unknown[] = [];
  const orderFilter = appendUserDealerScopeSql(reportScope.user, "dealer_id", orderBinds);
  const pending = await db
    .prepare(
      `SELECT COUNT(*) as c FROM orders WHERE status IN ('order_placed', 'pending_approval') AND deleted_at IS NULL${orderFilter}`,
    )
    .bind(...orderBinds)
    .first<{ c: number }>();

  const complaintBinds: unknown[] = [];
  const complaintFilter = appendUserDealerScopeSql(reportScope.user, "dealer_id", complaintBinds);
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
  monthOrderSql += appendUserDealerScopeSql(reportScope.user, "dealer_id", monthOrderBinds);
  const monthStats = await db
    .prepare(monthOrderSql)
    .bind(...monthOrderBinds)
    .first<{ orders: number; sales: number }>();

  const prevMonthBinds: unknown[] = [];
  let prevMonthSql = `SELECT COALESCE(SUM(total_value), 0) as sales
    FROM orders WHERE deleted_at IS NULL
      AND status NOT IN ('rejected', 'cancelled')
      AND strftime('%Y-%m', placed_at) = strftime('%Y-%m', 'now', '-1 month')`;
  prevMonthSql += appendUserDealerScopeSql(reportScope.user, "dealer_id", prevMonthBinds);
  const prevMonth = await db
    .prepare(prevMonthSql)
    .bind(...prevMonthBinds)
    .first<{ sales: number }>();

  const pointsBinds: unknown[] = [];
  let pointsSql = `SELECT COALESCE(SUM(pl.delta), 0) as pts
    FROM points_ledger pl JOIN dealers d ON d.id = pl.dealer_id
    WHERE pl.delta > 0 AND strftime('%Y-%m', pl.occurred_at) = strftime('%Y-%m', 'now')`;
  pointsSql += appendUserDealerScopeSql(reportScope.user, "d.id", pointsBinds);
  const pointsRow = await db.prepare(pointsSql).bind(...pointsBinds).first<{ pts: number }>();

  const approvedTodayBinds: unknown[] = [];
  let approvedTodaySql = `SELECT COUNT(*) as c FROM orders
    WHERE deleted_at IS NULL AND status = 'approved'
      AND approved_at IS NOT NULL
      AND strftime('%Y-%m-%d', datetime(approved_at, '+5 hours', '+30 minutes')) =
          strftime('%Y-%m-%d', datetime('now', '+5 hours', '+30 minutes'))`;
  approvedTodaySql += appendUserDealerScopeSql(reportScope.user, "dealer_id", approvedTodayBinds);
  const approvedTodayRow = await db
    .prepare(approvedTodaySql)
    .bind(...approvedTodayBinds)
    .first<{ c: number }>();

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
    approvedToday: approvedTodayRow?.c ?? 0,
    ...currentMonthLabels(),
  });
});

app.get("/api/v1/reports/monthly-sales", requireAuth, requireActiveAccount, requirePermission("reports:read"), async (c) => {
  const db = await getRequestDb(c);
  const user = c.get("user");
  const reportScope = await resolveReportScope(db, user);
  if (!reportScope.allowed) return c.json({ error: "Forbidden" }, 403);

  const binds: unknown[] = [];
  let sql = `SELECT strftime('%Y-%m', placed_at) as ym, SUM(total_value) as sales, COUNT(*) as orders FROM orders WHERE deleted_at IS NULL`;
  sql += appendUserDealerScopeSql(reportScope.user, "dealer_id", binds);
  sql += ` AND status NOT IN ('rejected', 'cancelled')`;
  // Take the SIX MOST-RECENT months (was ORDER BY ym ASC LIMIT 6, which returned the six OLDEST and
  // silently hid the latest months). Sort DESC to grab the newest, then reverse to chronological.
  sql += ` GROUP BY ym ORDER BY ym DESC LIMIT 6`;
  const { results } = await db.prepare(sql).bind(...binds).all<{ ym: string; sales: number; orders: number }>();
  const chronological = [...results].reverse();
  return c.json(
    chronological.map((r) => ({
      month: formatYearMonthLabel(r.ym),
      ym: r.ym,
      sales: Number(r.sales) || 0,
      orders: Number(r.orders) || 0,
    })),
  );
});

app.get("/api/v1/reports/product-sales", requireAuth, requireActiveAccount, requirePermission("reports:read"), async (c) => {
  const db = await getRequestDb(c);
  const user = c.get("user");
  const reportScope = await resolveReportScope(db, user);
  if (!reportScope.allowed) return c.json({ error: "Forbidden" }, 403);

  const binds: unknown[] = [];
  let sql = `SELECT oi.product_name as product, SUM(oi.line_total) as sales, SUM(oi.quantity) as units
       FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.deleted_at IS NULL`;
  sql += appendUserDealerScopeSql(reportScope.user, "o.dealer_id", binds);
  sql += ` AND o.status NOT IN ('rejected', 'cancelled')`;
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
  const currentEnd = now;
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

  const currentMonth = currentMonthLabels(now).currentMonthLabel;
  const previousMonth = currentMonthLabels(now).previousMonthLabel;

  const binds: unknown[] = [currentStart.toISOString(), currentEnd.toISOString(), previousStart.toISOString(), previousEnd.toISOString()];
  let dealerFilter = appendUserDealerScopeSql(reportScope.user, "d.id", binds);

  const dealerIdFilter = c.req.query("dealerId");
  if (dealerIdFilter) {
    if (!(await canAccessDealer(db, user, dealerIdFilter))) {
      return c.json({ error: "Forbidden" }, 403);
    }
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
      WHERE deleted_at IS NULL AND status NOT IN ('rejected', 'cancelled') AND placed_at >= ? AND placed_at <= ?
      GROUP BY dealer_id
    ) cur ON cur.dealer_id = d.id
    LEFT JOIN (
      SELECT dealer_id, SUM(total_value) AS sales, COUNT(*) AS orders
      FROM orders
      WHERE deleted_at IS NULL AND status NOT IN ('rejected', 'cancelled') AND placed_at >= ? AND placed_at <= ?
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

app.get("/api/v1/reports/visit-summary", requireAuth, requireActiveAccount, requirePermission("visits:read"), async (c) => {
  const db = await getRequestDb(c);
  const user = c.get("user");
  if (user.role === "admin_staff") return c.json({ error: "Forbidden" }, 403);
  if (user.role !== "sales_executive" && user.role !== "distributor" && user.role !== "master_admin") {
    return c.json({ error: "Forbidden" }, 403);
  }
  try {
    return c.json(
      await getVisitSummary(db, {
        fromDate: c.req.query("fromDate"),
        toDate: c.req.query("toDate"),
        salesExecutiveUserId: user.role === "sales_executive" ? user.id : undefined,
        distributorId: user.role === "distributor" ? user.distributorId : undefined,
      }),
    );
  } catch (err) {
    console.error(err);
    return c.json({
      total: 0,
      completed: 0,
      active: 0,
      uniqueStores: 0,
      bySalesExecutive: [],
      byStore: [],
      monthlyTrend: [],
    });
  }
});

// Public pincode lookup (pre-auth: used on the signup page). Resolves a 6-digit pincode to its
// State / District and the list of post-office areas. 404 when not found so the client can show a
// clear "invalid pincode" message.
app.get("/api/v1/pincode/:code", async (c) => {
  const db = await getRequestDb(c);
  const lookup = await lookupPincode(db, c.req.param("code"));
  if (!lookup) return c.json({ error: "Pincode not found" }, 404);
  return c.json(lookup);
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
      pincode: body.pincode,
      area: body.area ?? null,
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
  // sales_head is a read-only oversight role allowed into the admin API surface; its lack of any
  // *:write / approve / users permissions means every mutating admin route's requirePermission
  // gate still rejects it with 403. Read routes (gated on *:read) are what it can actually use.
  if (user.role !== "master_admin" && user.role !== "admin_staff" && user.role !== "sales_head") {
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

admin.delete("/products/:id", requirePermission("catalog:write"), async (c) => {
  const db = await getRequestDb(c);
  try {
    return c.json(await deleteAdminProduct(db, c.req.param("id"), c.get("user").id));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delete failed";
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
    const campaign = await saveAdminCampaign(db, body, c.get("user").id, undefined, effectiveEnv(c.env));
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
    return c.json(await activateAdminCampaign(db, c.req.param("id"), c.get("user").id, effectiveEnv(c.env)));
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

admin.get("/visits/summary", requirePermission("visits:read"), async (c) => {
  const db = await getRequestDb(c);
  return c.json(
    await getVisitSummary(db, {
      fromDate: c.req.query("fromDate"),
      toDate: c.req.query("toDate"),
    }),
  );
});

admin.get("/visits/filter-options", requirePermission("visits:read"), async (c) => {
  const db = await getRequestDb(c);
  const { results } = await db
    .prepare(
      `SELECT id, name FROM users
       WHERE role = 'sales_executive' AND deleted_at IS NULL AND status = 'active'
       ORDER BY name`,
    )
    .all<{ id: string; name: string }>();
  return c.json({ salesExecutives: results });
});

admin.get("/visits", requirePermission("visits:read"), async (c) => {
  const db = await getRequestDb(c);
  return c.json(
    await listVisits(db, {
      salesExecutiveUserId: c.req.query("salesExecutiveId"),
      // Optional dealer filter powers the Dealer Profile Visits tab. listVisits already supports it.
      dealerId: c.req.query("dealerId") || undefined,
      status: (c.req.query("status") as "active" | "completed" | "all") ?? "all",
      fromDate: c.req.query("fromDate"),
      toDate: c.req.query("toDate"),
      search: c.req.query("search"),
      page: Number(c.req.query("page") ?? 1),
      pageSize: Number(c.req.query("pageSize") ?? 20),
    }),
  );
});

admin.get("/visits/:id", requirePermission("visits:read"), async (c) => {
  const db = await getRequestDb(c);
  const visit = await getVisitById(db, c.req.param("id"));
  if (!visit) return c.json({ error: "Not found" }, 404);
  return c.json(visit);
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
      level: c.req.query("level") as "distributors" | "dealers" | "orders" | "all_dealers" | undefined,
      distributorId: c.req.query("distributorId"),
      dealerId: c.req.query("dealerId"),
      search: c.req.query("search"),
      from: c.req.query("from"),
      to: c.req.query("to"),
    }),
  );
});

function executiveFiltersFromQuery(c: { req: { query: (key: string) => string | undefined } }) {
  return {
    from: c.req.query("from") || undefined,
    to: c.req.query("to") || undefined,
    distributorId: c.req.query("distributorId") || undefined,
    dealerId: c.req.query("dealerId") || undefined,
    dealerIds: c.req.query("dealerIds") || undefined,
    salesExecutiveId: c.req.query("salesExecutiveId") || undefined,
    product: c.req.query("product") || undefined,
    category: c.req.query("category") || undefined,
    territory: c.req.query("territory") || undefined,
    state: c.req.query("state") || undefined,
    district: c.req.query("district") || undefined,
    area: c.req.query("area") || undefined,
    pincode: c.req.query("pincode") || undefined,
    status: c.req.query("status") || undefined,
    campaignId: c.req.query("campaignId") || undefined,
    hasArea: c.req.query("hasArea") === "1" || undefined,
  };
}

admin.get("/reports/snapshot", requirePermission("reports:read"), async (c) => {
  const db = await getRequestDb(c);
  return c.json(await buildExecutiveSnapshot(db, executiveFiltersFromQuery(c)));
});

admin.get("/reports/monthly", requirePermission("reports:read"), async (c) => {
  const db = await getRequestDb(c);
  return c.json(await buildMonthlyReport(db, executiveFiltersFromQuery(c)));
});

admin.get("/reports/accounts", requirePermission("reports:read"), async (c) => {
  const db = await getRequestDb(c);
  return c.json(await buildAccountsReport(db, executiveFiltersFromQuery(c)));
});

admin.get("/reports/products", requirePermission("reports:read"), async (c) => {
  const db = await getRequestDb(c);
  return c.json(await buildProductsReport(db, executiveFiltersFromQuery(c)));
});

admin.get("/reports/drilldown", requirePermission("reports:read"), async (c) => {
  const db = await getRequestDb(c);
  return c.json(
    await drilldownOrders(db, {
      ...executiveFiltersFromQuery(c),
      month: c.req.query("month") || undefined,
      page: Number(c.req.query("page") ?? 1),
      pageSize: Number(c.req.query("pageSize") ?? 20),
    }),
  );
});

admin.get("/pricing-tiers", requirePermission("catalog:read"), async (c) => {
  const db = await getRequestDb(c);
  return c.json({ items: await listPricingTiers(db) });
});

admin.post("/pricing-tiers", requirePermission("catalog:write"), async (c) => {
  const db = await getRequestDb(c);
  const body = await c.req.json();
  try {
    return c.json(await savePricingTier(db, body), 201);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Could not create tier" }, 400);
  }
});

admin.patch("/pricing-tiers/:id", requirePermission("catalog:write"), async (c) => {
  const db = await getRequestDb(c);
  const body = await c.req.json();
  try {
    return c.json(await savePricingTier(db, { ...body, id: c.req.param("id") }));
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Could not update tier" }, 400);
  }
});

admin.delete("/pricing-tiers/:id", requirePermission("catalog:write"), async (c) => {
  const db = await getRequestDb(c);
  try {
    await deletePricingTier(db, c.req.param("id"));
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Could not delete tier" }, 400);
  }
});

// NOTE: The legacy guarantee-keyed sqft-rate endpoints (/pricing/sqft-rates + /recalculate +
// /options, backed by api/services/mattress-sqft-rates.ts and the mattress_sqft_rates table) were
// removed. Mattress pricing is now per-product via product_sqft_rates (migration 0035), read live
// by buildPriceQuote. The legacy table is left in the DB (unused) to avoid a D1 rebuild.

admin.get("/system-notifications", requirePermission("settings:read"), async (c) => {
  const db = await getRequestDb(c);
  const view = c.req.query("view");

  if (view === "announcements") {
    const { listAnnouncements } = await import("./services/system-notifications-admin");
    return c.json(
      await listAnnouncements(db, {
        search: c.req.query("search"),
        category: c.req.query("category"),
        active: c.req.query("active"),
        page: Number(c.req.query("page") ?? 1),
        pageSize: Number(c.req.query("pageSize") ?? 10),
      }),
    );
  }

  // Audit view: announcement records only — never expose other users' private notifications.
  const { listAnnouncements } = await import("./services/system-notifications-admin");
  return c.json(
    await listAnnouncements(db, {
      search: c.req.query("search"),
      category: c.req.query("category"),
      active: c.req.query("active"),
      page: Number(c.req.query("page") ?? 1),
      pageSize: Number(c.req.query("pageSize") ?? 50),
    }),
  );
});

admin.post("/system-notifications", requirePermission("settings:write"), async (c) => {
  const db = await getRequestDb(c);
  const body = await c.req.json();
  const { createAnnouncement } = await import("./services/system-notifications-admin");
  try {
    const row = await createAnnouncement(db, body);
    return c.json(row, 201);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Create failed" }, 400);
  }
});

admin.patch("/system-notifications/:id", requirePermission("settings:write"), async (c) => {
  const db = await getRequestDb(c);
  const body = await c.req.json();
  const paramId = c.req.param("id");

  const { updateAnnouncement } = await import("./services/system-notifications-admin");
  const updated = await updateAnnouncement(db, paramId, body);
  if (!updated) return c.json({ error: "Announcement not found" }, 404);
  return c.json(updated);
});

// Send Again: create a NEW send event for an existing notification template and dispatch now or
// schedule it. Reuses the template's saved audience unless overridden. Does not alter the template
// or prior send history.
admin.post("/system-notifications/:id/resend", requirePermission("settings:write"), async (c) => {
  const db = await getRequestDb(c);
  const body = await c.req.json<{
    mode?: "now" | "schedule";
    sendAt?: string;
    audiences?: string[];
    popupMaxPerDay?: number;
  }>().catch(() => ({}));
  const { resendAnnouncement } = await import("./services/system-notifications-admin");
  try {
    const result = await resendAnnouncement(db, c.req.param("id"), {
      mode: body.mode,
      sendAt: body.sendAt,
      audiences: body.audiences as never,
      popupMaxPerDay: body.popupMaxPerDay,
    });
    return c.json(result, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Resend failed";
    return c.json({ error: message }, message.includes("not found") ? 404 : 400);
  }
});

admin.delete("/system-notifications/:id", requirePermission("settings:write"), async (c) => {
  const db = await getRequestDb(c);
  const paramId = c.req.param("id");
  const { deleteAnnouncement } = await import("./services/system-notifications-admin");
  try {
    await deleteAnnouncement(db, paramId);
    return c.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delete failed";
    return c.json({ error: message }, 404);
  }
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
    kind?: string;
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
    kind?: string;
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
  // Use the role-scoped workflow list so the admin/staff claims screen reflects the full lifecycle
  // (pending_approval -> ... -> delivered) rather than the legacy pending/delivered view.
  return c.json(
    await listRewardClaimsScoped(db, c.get("user"), {
      status: c.req.query("status"),
      search: c.req.query("search"),
      page: Number(c.req.query("page") ?? 1),
      pageSize: Number(c.req.query("pageSize") ?? 10),
    }),
  );
});

admin.patch("/reward-claims/:id", requirePermission("catalog:write"), async (c) => {
  if (c.get("user").role !== "master_admin") return c.json({ error: "Forbidden" }, 403);
  const db = await getRequestDb(c);
  const body = await c.req.json<{ status: "pending" | "delivered" }>();
  try {
    return c.json(await updateRewardClaimStatus(db, c.req.param("id"), body.status, c.get("user").id));
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Update failed" }, 400);
  }
});

admin.post("/reward-claims/:id/undo", requirePermission("catalog:write"), async (c) => {
  if (c.get("user").role !== "master_admin") return c.json({ error: "Forbidden" }, 403);
  const db = await getRequestDb(c);
  try {
    return c.json(await undoRewardClaim(db, c.req.param("id"), c.get("user").id));
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Undo failed" }, 400);
  }
});

// --- Master Admin Reward Points management (manual credit + annual reward-year reset) ---
// All gated to master_admin only (in addition to the rewards:read admin-surface gate). Manual
// credits and the reset are recorded in the immutable points_ledger + reward_year_resets, audited,
// and (for credits) the dealer is notified.

// Preview a single dealer's current balance before crediting (name/code + authoritative balance).
admin.get("/reward-points/dealers/:id", requirePermission("rewards:read"), async (c) => {
  if (c.get("user").role !== "master_admin") return c.json({ error: "Forbidden" }, 403);
  const db = await getRequestDb(c);
  const summary = await getDealerBalanceSummary(db, c.req.param("id"));
  if (!summary) return c.json({ error: "Dealer not found" }, 404);
  return c.json(summary);
});

// Manually credit reward points to one dealer. Reason mandatory.
admin.post("/reward-points/credit", requirePermission("rewards:read"), async (c) => {
  if (c.get("user").role !== "master_admin") return c.json({ error: "Forbidden" }, 403);
  const db = await getRequestDb(c);
  const body = await c.req.json<{ dealerId?: string; points?: number; reason?: string }>();
  if (!body.dealerId) return c.json({ error: "Select a dealer" }, 400);
  try {
    const result = await creditDealerPointsManual(db, {
      dealerId: body.dealerId,
      points: Number(body.points ?? 0),
      reason: String(body.reason ?? ""),
      actor: c.get("user"),
      ip: c.req.header("cf-connecting-ip") ?? null,
    });
    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Credit failed";
    return c.json({ error: message }, message.includes("not found") ? 404 : 400);
  }
});

// Whether the current reward year has already been reset (drives the duplicate-reset confirmation).
admin.get("/reward-points/reset-status", requirePermission("rewards:read"), async (c) => {
  if (c.get("user").role !== "master_admin") return c.json({ error: "Forbidden" }, 403);
  const db = await getRequestDb(c);
  return c.json(await getRewardResetStatus(db));
});

// Reset ALL dealers' available reward balance to zero for the new reward year. Requires code "1410".
admin.post("/reward-points/reset", requirePermission("rewards:read"), async (c) => {
  if (c.get("user").role !== "master_admin") return c.json({ error: "Forbidden" }, 403);
  const db = await getRequestDb(c);
  const body = await c.req.json<{ code?: string }>();
  try {
    const result = await resetAllDealerRewards(db, {
      code: String(body.code ?? ""),
      actor: c.get("user"),
      ip: c.req.header("cf-connecting-ip") ?? null,
    });
    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Reset failed";
    // Incorrect code -> 403; already-reset -> 409; else 400.
    const status = message.includes("code") ? 403 : message.includes("already been reset") ? 409 : 400;
    return c.json({ error: message }, status);
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

// Sales Executives oversight (view-only). Unscoped: returns ALL sales executives + their
// aggregated performance. Gated by dealers:read, held by master_admin and admin_staff.
admin.get("/sales-executives", requirePermission("dealers:read"), async (c) => {
  const db = await getRequestDb(c);
  return c.json({ items: await listSalesExecutives(db) });
});

admin.get("/sales-executives/:id", requirePermission("dealers:read"), async (c) => {
  const db = await getRequestDb(c);
  const detail = await getSalesExecutiveDetail(db, c.req.param("id"));
  if (!detail) return c.json({ error: "Not found" }, 404);
  return c.json(detail);
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

// WhatsApp integration status + recent message log (no secrets, phones masked).
admin.get("/whatsapp/outbox", requirePermission("settings:read"), async (c) => {
  const db = await getRequestDb(c);
  const env = effectiveEnv(c.env);
  return c.json({
    configured: Boolean((env.GUPSHUP_API_KEY ?? "").trim() && (env.GUPSHUP_SOURCE ?? "").trim()),
    templates: [
      "otp_for_login",
      "mattress_order_placed",
      "mattress_order_rejection",
      "mattress_delivered",
      "campaign_live",
    ],
    messages: await listWhatsappOutbox(db, {
      limit: Number(c.req.query("limit") ?? 100),
      status: c.req.query("status") ?? undefined,
    }),
  });
});

// Send ONE approved template to a designated test number (master admin only). No free-form text.
admin.post("/whatsapp/test", requirePermission("settings:write"), async (c) => {
  const db = await getRequestDb(c);
  const env = effectiveEnv(c.env);
  const body = await c.req.json<{ templateKey?: string; phone?: string }>();
  const templateKey = String(body.templateKey ?? "");
  const phone = String(body.phone ?? env.WHATSAPP_TEST_PHONE ?? "").trim();
  if (!phone) return c.json({ error: "No test phone provided or configured" }, 400);
  const result = await sendWhatsappTest(db, env, templateKey, phone);
  return c.json(result, result.ok ? 200 : 400);
});

// Check the REAL delivery status of a logged WhatsApp message from Gupshup (delivered/read/failed +
// reason) — surfaces why a "sent" message never arrived. Read-only.
admin.get("/whatsapp/outbox/:id/status", requirePermission("settings:read"), async (c) => {
  const db = await getRequestDb(c);
  const env = effectiveEnv(c.env);
  const result = await checkWhatsappDeliveryStatus(db, env, c.req.param("id"));
  return c.json(result, result.ok ? 200 : 400);
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

admin.get("/signup-applications/options", requirePermission("signup:review"), async (c) => {
  const db = await getRequestDb(c);
  const distributorId = c.req.query("distributorId") ?? undefined;
  return c.json(await getSignupApprovalOptions(db, distributorId));
});

admin.patch("/signup-applications/:id", requirePermission("signup:review"), async (c) => {
  const db = await getRequestDb(c);
  const body = await c.req.json();
  try {
    const result = await reviewSignupApplication(db, c.req.param("id"), body, c.get("user"));
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
  await processWhatsappOutbox(db, effectiveEnv(c.env), body.outboxId);
  return c.json({ ok: true });
});

// Salespeople for dealer
app.get("/api/v1/dealer/salespeople", requireAuth, requireActiveAccount, requirePermission("orders:create"), async (c) => {
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
  return app.fetch(request, env ?? ({} as ApiEnv), resolveExecutionContext(_ctx));
}

export { app };
