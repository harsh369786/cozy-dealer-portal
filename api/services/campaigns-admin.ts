import { id, nowIso } from "../utils";
import { normalizeStoredImageUrl } from "./image-data-url";
import { writeAuditLog } from "./audit";
import { notifyCampaignPublished } from "./notification-events";
import {
  getEffectiveCampaignStatus,
  isCampaignLive,
  normalizeCampaignDate,
  readCampaignDate,
  todayIso,
} from "./campaign-utils";

export type AdminCampaignRow = {
  id: string;
  name: string;
  /** Legacy single-product display name (first targeted product, or "All products"). Kept for back-compat. */
  product: string;
  /** Legacy single product id (first targeted product, or undefined for all-products). Kept for back-compat. */
  productId?: string;
  /** Full set of targeted products (multi-product campaigns). Empty => all-products. */
  products?: Array<{ id: string; name: string }>;
  /** Convenience id list mirroring `products`. */
  productIds?: string[];
  discountPercent?: number;
  goal?: string;
  reward?: string;
  target?: number;
  done?: number;
  distributorId?: string;
  distributorName?: string;
  description: string;
  startDate: string;
  endDate: string;
  status: string;
  storedStatus: string;
  badgeLabel?: string;
  active: boolean;
  whatsappTargetDealers: boolean;
  whatsappTargetDistributors: boolean;
  imageUrl?: string;
};

export type CampaignFilters = {
  search?: string;
  status?: string;
  active?: "all" | "active" | "inactive";
  page?: number;
  pageSize?: number;
};

export type CampaignInput = {
  id?: string;
  name: string;
  productId?: string;
  product?: string;
  /** Multi-product target list. When provided, ALL are saved to the join table; the first also
   *  becomes the legacy price_campaigns.product_id for back-compat. Empty/omitted => all-products. */
  productIds?: string[];
  discountPercent?: number;
  description?: string;
  terms?: string;
  badgeLabel?: string;
  startDate: string;
  endDate: string;
  status?: string;
  active?: boolean;
  whatsappTargetDealers?: boolean;
  whatsappTargetDistributors?: boolean;
  imageUrl?: string | null;
};

function isActiveStatus(status: string, startDate: string, endDate: string) {
  return isCampaignLive(status, startDate, endDate);
}

async function sendCampaignNotifications(
  db: D1Database,
  campaign: AdminCampaignRow,
  env?: { WHATSAPP_QUEUE?: Queue },
) {
  if (campaign.status === "expired") return;
  if (campaign.status !== "active" && campaign.status !== "upcoming") return;

  await notifyCampaignPublished(db, {
    campaignId: campaign.id,
    name: campaign.name,
    productName: campaign.product,
    productId: campaign.productId,
    discountPercent: campaign.discountPercent,
    distributorId: campaign.distributorId ?? null,
  });

  // WhatsApp "campaign_live" broadcast — best-effort, only to the audience the campaign targets.
  // Never throws (enqueueWhatsapp swallows). Each recipient gets a per-recipient referenceId so the
  // dedup index makes a re-publish/re-activate a no-op per recipient without collapsing all
  // recipients into one row.
  try {
    await sendCampaignWhatsapp(db, campaign, env ?? {});
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[whatsapp] campaign broadcast failed for ${campaign.id}: ${message}`);
  }
}

/**
 * Enqueue the campaign_live WhatsApp to the campaign's dealer/distributor audience. Mirrors the
 * in-app recipient resolution in notifyCampaignPublished but selects phones. Gated on the campaign's
 * whatsappTargetDealers / whatsappTargetDistributors flags. Distributor-scoped when the campaign
 * belongs to one distributor, else all active dealers/distributors.
 */
async function sendCampaignWhatsapp(
  db: D1Database,
  campaign: AdminCampaignRow,
  env: { WHATSAPP_QUEUE?: Queue },
) {
  const { enqueueWhatsapp } = await import("./whatsapp");
  const distributorId = campaign.distributorId ?? null;

  const phones: string[] = [];
  if (campaign.whatsappTargetDealers) {
    const rows = distributorId
      ? await db
          .prepare(
            `SELECT u.phone FROM users u
             JOIN dealers d ON d.id = u.dealer_id
             WHERE d.distributor_id = ? AND u.role = 'dealer' AND u.status = 'active' AND u.deleted_at IS NULL
               AND u.phone IS NOT NULL AND u.phone != ''`,
          )
          .bind(distributorId)
          .all<{ phone: string }>()
      : await db
          .prepare(
            `SELECT phone FROM users
             WHERE role = 'dealer' AND status = 'active' AND deleted_at IS NULL
               AND phone IS NOT NULL AND phone != ''`,
          )
          .all<{ phone: string }>();
    for (const r of rows.results) phones.push(r.phone);
  }
  if (campaign.whatsappTargetDistributors) {
    const rows = distributorId
      ? await db
          .prepare(
            `SELECT phone FROM users
             WHERE distributor_id = ? AND role = 'distributor' AND status = 'active' AND deleted_at IS NULL
               AND phone IS NOT NULL AND phone != ''`,
          )
          .bind(distributorId)
          .all<{ phone: string }>()
      : await db
          .prepare(
            `SELECT phone FROM users
             WHERE role = 'distributor' AND status = 'active' AND deleted_at IS NULL
               AND phone IS NOT NULL AND phone != ''`,
          )
          .all<{ phone: string }>();
    for (const r of rows.results) phones.push(r.phone);
  }

  // De-dup phones within this broadcast, then enqueue one row each with a per-recipient referenceId.
  const seen = new Set<string>();
  for (const phone of phones) {
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);
    await enqueueWhatsapp(db, env, {
      toPhone: phone,
      templateKey: "campaign_live",
      payload: {},
      referenceId: `${campaign.id}:${phone}`,
    });
  }
}

function mapCampaign(
  r: Record<string, unknown>,
  products?: Array<{ id: string; name: string }>,
): AdminCampaignRow {
  const storedStatus = r.status as string;
  const startDate = readCampaignDate(r.start_at);
  const endDate = readCampaignDate(r.end_at);
  const status = getEffectiveCampaignStatus(storedStatus, startDate, endDate);
  const productName = (r.product_name as string) ?? undefined;
  const productId = (r.product_id as string) ?? undefined;
  // Multi-product: prefer the join-table product set. Fall back to the legacy single product_id so
  // campaigns created before this feature still display their single product.
  const targetProducts =
    products && products.length
      ? products
      : productId
        ? [{ id: productId, name: productName ?? productId }]
        : [];
  const productLabel =
    targetProducts.length > 0
      ? targetProducts.map((p) => p.name).join(", ")
      : "All products";
  return {
    id: r.id as string,
    name: r.name as string,
    product: productLabel,
    productId: targetProducts[0]?.id ?? productId,
    products: targetProducts,
    productIds: targetProducts.map((p) => p.id),
    discountPercent: Number(r.discount_percent ?? 0) || undefined,
    target: (r.target_count as number) ?? undefined,
    done: (r.done_count as number) ?? undefined,
    distributorId: (r.distributor_id as string) ?? undefined,
    distributorName: (r.distributor_name as string) ?? undefined,
    description: (r.description as string) ?? "",
    startDate,
    endDate,
    status,
    storedStatus,
    badgeLabel: (r.badge_label as string) ?? undefined,
    active: isActiveStatus(storedStatus, startDate, endDate) && !r.deleted_at,
    whatsappTargetDealers: Boolean(r.whatsapp_target_dealers ?? 1),
    whatsappTargetDistributors: Boolean(r.whatsapp_target_distributors ?? 0),
    imageUrl: (r.image_url as string) ?? undefined,
  };
}

async function loadCampaign(db: D1Database, campaignId: string): Promise<AdminCampaignRow | null> {
  const row = await db
    .prepare(
      `SELECT pc.*, p.name as product_name, d.name as distributor_name
       FROM price_campaigns pc
       LEFT JOIN products p ON p.id = pc.product_id
       LEFT JOIN distributors d ON d.id = pc.distributor_id
       WHERE pc.id = ? AND pc.deleted_at IS NULL`,
    )
    .bind(campaignId)
    .first<Record<string, unknown>>();
  if (!row) return null;
  const productsMap = await loadCampaignProductsBatch(db, [campaignId]);
  return mapCampaign(row, productsMap.get(campaignId));
}

export async function listAdminCampaigns(db: D1Database, filters: CampaignFilters = {}) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
  const today = todayIso();
  const baseSql = `WITH campaign_rows AS (
    SELECT pc.*, p.name AS product_name, d.name AS distributor_name,
      CASE
        WHEN date(pc.start_at) IS NULL OR date(pc.end_at) IS NULL THEN 'expired'
        WHEN date(pc.end_at) < date(?) OR pc.status = 'expired' THEN 'expired'
        WHEN date(pc.start_at) > date(?) OR pc.status = 'upcoming' THEN 'upcoming'
        ELSE 'active'
      END AS effective_status
    FROM price_campaigns pc
    LEFT JOIN products p ON p.id = pc.product_id
    LEFT JOIN distributors d ON d.id = pc.distributor_id
    WHERE pc.deleted_at IS NULL
  )`;
  let where = ` WHERE 1 = 1`;
  const filterBinds: unknown[] = [];

  if (filters.search?.trim()) {
    const q = `%${filters.search.trim()}%`;
    where += ` AND (
      name LIKE ? OR COALESCE(product_name, product_id, 'All products') LIKE ?
      OR COALESCE(description, '') LIKE ? OR COALESCE(badge_label, '') LIKE ?
    )`;
    filterBinds.push(q, q, q, q);
  }
  if (filters.status && filters.status !== "all") {
    where += ` AND effective_status = ?`;
    filterBinds.push(filters.status);
  }
  if (filters.active === "active") {
    where += ` AND effective_status = 'active'`;
  } else if (filters.active === "inactive") {
    where += ` AND effective_status <> 'active'`;
  }

  const commonBinds = [today, today, ...filterBinds];
  const countRow = await db
    .prepare(`${baseSql} SELECT COUNT(*) AS total FROM campaign_rows${where}`)
    .bind(...commonBinds)
    .first<{ total: number }>();
  const total = countRow?.total ?? 0;
  const offset = (page - 1) * pageSize;
  const { results } = await db
    .prepare(
      `${baseSql}
       SELECT * FROM campaign_rows${where}
       ORDER BY start_at DESC, id DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(...commonBinds, pageSize, offset)
    .all();

  const productsMap = await loadCampaignProductsBatch(
    db,
    results.map((r) => (r as Record<string, unknown>).id as string),
  );
  return {
    items: results.map((r) =>
      mapCampaign(r as Record<string, unknown>, productsMap.get((r as Record<string, unknown>).id as string)),
    ),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getAdminCampaign(db: D1Database, campaignId: string) {
  return loadCampaign(db, campaignId);
}

/**
 * Resolve the campaign's full target product-id set from the input. Prefers the explicit
 * productIds[] list (multi-product); falls back to the single productId/product name (legacy).
 * Returns a de-duplicated, order-preserving list. An empty list means "all products".
 */
async function resolveProductIds(
  db: D1Database,
  input: CampaignInput,
  fallback?: string[],
): Promise<string[]> {
  let ids: string[] = [];
  if (Array.isArray(input.productIds)) {
    ids = input.productIds.filter((x) => typeof x === "string" && x.trim());
  } else if (input.productId) {
    ids = [input.productId];
  } else if (fallback && fallback.length) {
    ids = [...fallback];
  } else {
    const single = await resolveProductId(db, input);
    if (single) ids = [single];
  }
  // De-dupe, preserve order.
  return Array.from(new Set(ids));
}

/** Replace a campaign's join rows with the given product set (delete-then-insert, atomic batch). */
async function saveCampaignProducts(db: D1Database, campaignId: string, productIds: string[]) {
  const statements = [
    db.prepare(`DELETE FROM price_campaign_products WHERE campaign_id = ?`).bind(campaignId),
  ];
  for (const productId of productIds) {
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO price_campaign_products (campaign_id, product_id) VALUES (?, ?)`,
        )
        .bind(campaignId, productId),
    );
  }
  await db.batch(statements);
}

/** Batch-load the targeted products (id + name) for a set of campaigns. Never throws if the table
 *  doesn't exist yet (pre-migration) — returns an empty map so callers fall back to product_id. */
async function loadCampaignProductsBatch(
  db: D1Database,
  campaignIds: string[],
): Promise<Map<string, Array<{ id: string; name: string }>>> {
  const map = new Map<string, Array<{ id: string; name: string }>>();
  if (!campaignIds.length) return map;
  try {
    const placeholders = campaignIds.map(() => "?").join(",");
    const { results } = await db
      .prepare(
        `SELECT pcp.campaign_id, pcp.product_id, p.name AS product_name
         FROM price_campaign_products pcp
         LEFT JOIN products p ON p.id = pcp.product_id
         WHERE pcp.campaign_id IN (${placeholders})
         ORDER BY pcp.campaign_id, p.name`,
      )
      .bind(...campaignIds)
      .all<{ campaign_id: string; product_id: string; product_name: string | null }>();
    for (const r of results) {
      const list = map.get(r.campaign_id) ?? [];
      list.push({ id: r.product_id, name: r.product_name ?? r.product_id });
      map.set(r.campaign_id, list);
    }
  } catch {
    // Join table not present yet (migration not applied) — fall back to legacy product_id.
  }
  return map;
}

async function resolveProductId(
  db: D1Database,
  input: CampaignInput,
  fallbackId?: string,
): Promise<string | null> {
  if (input.productId) return input.productId;
  if (fallbackId) return fallbackId;
  const productName = input.product?.trim();
  if (!productName || productName.toLowerCase() === "all products") return null;
  const product = await db
    .prepare(`SELECT id FROM products WHERE name = ? AND deleted_at IS NULL LIMIT 1`)
    .bind(productName)
    .first<{ id: string }>();
  return product?.id ?? null;
}

function resolveCampaignImageUrl(input: CampaignInput, before?: AdminCampaignRow): string | null {
  if ("imageUrl" in input) return normalizeStoredImageUrl(input.imageUrl);
  return before?.imageUrl ? normalizeStoredImageUrl(before.imageUrl) : null;
}

/** Validate discount range + date order, and reject overlapping active campaigns for the same product scope. */
async function validateCampaignInput(
  db: D1Database,
  args: {
    campaignId: string;
    /** Full target set. Empty => all-products (NULL scope). */
    productIds: string[];
    discountPercent: number;
    startDate: string;
    endDate: string;
    status: string;
  },
) {
  const discount = Number(args.discountPercent);
  // Cap below 100% so a fat-finger 100 can't ship product for free. 99% is already an extreme
  // discount; a true giveaway should be handled deliberately, not via a campaign discount.
  if (!Number.isFinite(discount) || discount < 0 || discount > 99) {
    throw new Error("Discount must be between 0 and 99");
  }
  if (args.startDate > args.endDate) {
    throw new Error("Campaign start date must be on or before the end date");
  }

  // Only enforce overlap when the campaign is (or will be) live, not for expired ones.
  if (args.status === "expired") return;

  // Check overlap PER targeted product (all-products = the NULL scope). A candidate conflicts if it
  // shares ANY product scope during overlapping dates. A campaign now targets products via both the
  // legacy price_campaigns.product_id AND the price_campaign_products join table, so an existing
  // campaign is considered to target product X if either matches. This preserves the original
  // single-product / all-products behavior while covering the multi-product case.
  const scopes: Array<string | null> = args.productIds.length ? args.productIds : [null];
  for (const scope of scopes) {
    const conflict = await db
      .prepare(
        `SELECT pc.id FROM price_campaigns pc
         WHERE pc.deleted_at IS NULL
           AND pc.id != ?
           AND (
             (pc.product_id = ?) OR (pc.product_id IS NULL AND ? IS NULL)
             OR (? IS NOT NULL AND pc.id IN (
               SELECT campaign_id FROM price_campaign_products WHERE product_id = ?
             ))
           )
           AND IFNULL(pc.status, 'active') != 'expired'
           AND date(substr(pc.start_at, 1, 10)) <= date(?)
           AND date(substr(pc.end_at, 1, 10)) >= date(?)
         LIMIT 1`,
      )
      .bind(args.campaignId, scope, scope, scope, scope, args.endDate, args.startDate)
      .first<{ id: string }>();
    if (conflict) {
      throw new Error("An overlapping campaign already exists for this product during these dates.");
    }
  }
}

export async function createCampaign(
  db: D1Database,
  input: CampaignInput,
  actorUserId: string,
  env?: { WHATSAPP_QUEUE?: Queue },
) {
  if (!input.name?.trim()) throw new Error("Campaign name is required");

  // Full target set (multi-product). The legacy product_id column holds the FIRST product (or NULL
  // for all-products) so every existing single-product query keeps working.
  const productIds = await resolveProductIds(db, input);
  const productId = productIds[0] ?? null;
  const campaignId = input.id ?? id("pc");
  const status = input.status ?? "active";
  const startDate = normalizeCampaignDate(input.startDate);
  const endDate = normalizeCampaignDate(input.endDate);
  await validateCampaignInput(db, {
    campaignId,
    productIds,
    discountPercent: input.discountPercent ?? 0,
    startDate,
    endDate,
    status,
  });
  await db
    .prepare(
      `INSERT INTO price_campaigns (id, name, product_id, discount_percent, start_at, end_at, description, terms, badge_label, status, whatsapp_target_dealers, whatsapp_target_distributors, image_r2_key, image_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      campaignId,
      input.name.trim(),
      productId,
      input.discountPercent ?? 0,
      startDate,
      endDate,
      input.description ?? "",
      input.terms ?? null,
      input.badgeLabel ?? null,
      status,
      input.whatsappTargetDealers === false ? 0 : 1,
      input.whatsappTargetDistributors ? 1 : 0,
      null,
      resolveCampaignImageUrl(input),
    )
    .run();
  await saveCampaignProducts(db, campaignId, productIds);

  const created = await loadCampaign(db, campaignId);
  await writeAuditLog(db, {
    actorUserId,
    action: "campaign.create",
    entityType: "campaign",
    entityId: campaignId,
    after: created,
  });
  if (created) {
    await sendCampaignNotifications(db, created, env);
    await db
      .prepare(`UPDATE price_campaigns SET notifications_sent_at = ? WHERE id = ?`)
      .bind(nowIso(), campaignId)
      .run();
  }
  return created!;
}

export async function updateCampaign(
  db: D1Database,
  campaignId: string,
  input: CampaignInput,
  actorUserId: string,
) {
  const before = await loadCampaign(db, campaignId);
  if (!before) throw new Error("Campaign not found");

  // Full target set. When the input omits productIds entirely, fall back to the campaign's existing
  // product set so an unrelated edit (e.g. changing the discount) doesn't wipe the products.
  const productIds = await resolveProductIds(db, input, before.productIds ?? []);
  const productId = productIds[0] ?? null;
  const startDate = normalizeCampaignDate(input.startDate);
  const endDate = normalizeCampaignDate(input.endDate);
  await validateCampaignInput(db, {
    campaignId,
    productIds,
    discountPercent: input.discountPercent ?? before.discountPercent ?? 0,
    startDate,
    endDate,
    status: input.status ?? before.storedStatus,
  });

  await db
    .prepare(
      `UPDATE price_campaigns SET name = ?, product_id = ?, discount_percent = ?, start_at = ?, end_at = ?,
       description = ?, terms = ?, badge_label = ?, status = ?,
       whatsapp_target_dealers = ?, whatsapp_target_distributors = ?, image_r2_key = ?, image_url = ?
       WHERE id = ? AND deleted_at IS NULL`,
    )
    .bind(
      input.name.trim(),
      productId,
      input.discountPercent ?? before.discountPercent ?? 0,
      startDate,
      endDate,
      input.description ?? before.description,
      input.terms ?? null,
      input.badgeLabel ?? before.badgeLabel ?? null,
      input.status ?? before.storedStatus,
      input.whatsappTargetDealers === false ? 0 : 1,
      input.whatsappTargetDistributors ? 1 : 0,
      null,
      resolveCampaignImageUrl(input, before),
      campaignId,
    )
    .run();
  await saveCampaignProducts(db, campaignId, productIds);

  const after = await loadCampaign(db, campaignId);
  await writeAuditLog(db, {
    actorUserId,
    action: "campaign.update",
    entityType: "campaign",
    entityId: campaignId,
    before,
    after,
  });
  return after!;
}

export async function archiveAdminCampaign(db: D1Database, campaignId: string, actorUserId: string) {
  const before = await loadCampaign(db, campaignId);
  if (!before) throw new Error("Campaign not found");

  const ts = nowIso();
  await db
    .prepare(`UPDATE price_campaigns SET status = 'expired', deleted_at = ? WHERE id = ?`)
    .bind(ts, campaignId)
    .run();

  await writeAuditLog(db, {
    actorUserId,
    action: "campaign.archive",
    entityType: "campaign",
    entityId: campaignId,
    before,
    after: { status: "expired", deletedAt: ts },
  });
  return { ok: true };
}

async function shouldSendCampaignNotifications(notificationsSentAt: string | null | undefined) {
  if (!notificationsSentAt) return true;
  const hourAgo = Date.now() - 60 * 60 * 1000;
  return new Date(notificationsSentAt).getTime() < hourAgo;
}

export async function activateAdminCampaign(
  db: D1Database,
  campaignId: string,
  actorUserId: string,
  env?: { WHATSAPP_QUEUE?: Queue },
) {
  const before = await loadCampaign(db, campaignId);
  if (!before) throw new Error("Campaign not found");

  const row = await db
    .prepare(`SELECT notifications_sent_at FROM price_campaigns WHERE id = ?`)
    .bind(campaignId)
    .first<{ notifications_sent_at: string | null }>();

  await db
    .prepare(`UPDATE price_campaigns SET status = 'active', deleted_at = NULL WHERE id = ?`)
    .bind(campaignId)
    .run();

  const after = await loadCampaign(db, campaignId);
  await writeAuditLog(db, {
    actorUserId,
    action: "campaign.activate",
    entityType: "campaign",
    entityId: campaignId,
    before,
    after,
  });
  if (after && shouldSendCampaignNotifications(row?.notifications_sent_at)) {
    await sendCampaignNotifications(db, after, env);
    await db
      .prepare(`UPDATE price_campaigns SET notifications_sent_at = ? WHERE id = ?`)
      .bind(nowIso(), campaignId)
      .run();
  }
  return after!;
}

export async function saveAdminCampaign(
  db: D1Database,
  input: Record<string, unknown>,
  actorUserId: string,
  existingId?: string,
  env?: { WHATSAPP_QUEUE?: Queue },
) {
  const payload = input as CampaignInput;
  // updateCampaign does NOT broadcast (only create/activate do), so env isn't needed for it.
  if (existingId) return updateCampaign(db, existingId, payload, actorUserId);
  return createCampaign(db, payload, actorUserId, env);
}
