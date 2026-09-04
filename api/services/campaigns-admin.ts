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
  product: string;
  productId?: string;
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

async function sendCampaignNotifications(db: D1Database, campaign: AdminCampaignRow) {
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
}

function mapCampaign(r: Record<string, unknown>): AdminCampaignRow {
  const storedStatus = r.status as string;
  const startDate = readCampaignDate(r.start_at);
  const endDate = readCampaignDate(r.end_at);
  const status = getEffectiveCampaignStatus(storedStatus, startDate, endDate);
  const productName = (r.product_name as string) ?? undefined;
  const productId = (r.product_id as string) ?? undefined;
  return {
    id: r.id as string,
    name: r.name as string,
    product: productName ?? productId ?? "All products",
    productId,
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
  return row ? mapCampaign(row) : null;
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

  return {
    items: results.map(mapCampaign),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getAdminCampaign(db: D1Database, campaignId: string) {
  return loadCampaign(db, campaignId);
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
    productId: string | null;
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

  // Same product scope = same product_id value, and all-products (NULL) overlaps all-products.
  const conflict = await db
    .prepare(
      `SELECT id FROM price_campaigns
       WHERE deleted_at IS NULL
         AND id != ?
         AND ((product_id = ?) OR (product_id IS NULL AND ? IS NULL))
         AND IFNULL(status, 'active') != 'expired'
         AND date(substr(start_at, 1, 10)) <= date(?)
         AND date(substr(end_at, 1, 10)) >= date(?)
       LIMIT 1`,
    )
    .bind(args.campaignId, args.productId, args.productId, args.endDate, args.startDate)
    .first<{ id: string }>();
  if (conflict) {
    throw new Error("An overlapping campaign already exists for this product during these dates.");
  }
}

export async function createCampaign(db: D1Database, input: CampaignInput, actorUserId: string) {
  if (!input.name?.trim()) throw new Error("Campaign name is required");

  const productId = await resolveProductId(db, input);
  const campaignId = input.id ?? id("pc");
  const status = input.status ?? "active";
  const startDate = normalizeCampaignDate(input.startDate);
  const endDate = normalizeCampaignDate(input.endDate);
  await validateCampaignInput(db, {
    campaignId,
    productId,
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

  const created = await loadCampaign(db, campaignId);
  await writeAuditLog(db, {
    actorUserId,
    action: "campaign.create",
    entityType: "campaign",
    entityId: campaignId,
    after: created,
  });
  if (created) {
    await sendCampaignNotifications(db, created);
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

  const productId = await resolveProductId(db, input, before.productId);
  const startDate = normalizeCampaignDate(input.startDate);
  const endDate = normalizeCampaignDate(input.endDate);
  await validateCampaignInput(db, {
    campaignId,
    productId,
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

export async function activateAdminCampaign(db: D1Database, campaignId: string, actorUserId: string) {
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
    await sendCampaignNotifications(db, after);
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
) {
  const payload = input as CampaignInput;
  if (existingId) return updateCampaign(db, existingId, payload, actorUserId);
  return createCampaign(db, payload, actorUserId);
}
