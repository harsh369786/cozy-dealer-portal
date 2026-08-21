import { id, nowIso } from "../utils";
import { normalizeStoredImageUrl } from "./image-data-url";
import { writeAuditLog } from "./audit";
import { notifyCampaignPublished } from "./notification-events";
import {
  getEffectiveCampaignStatus,
  isCampaignLive,
  normalizeCampaignDate,
  readCampaignDate,
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
    discountPercent: campaign.discountPercent,
    targetDealers: campaign.whatsappTargetDealers,
    targetDistributors: campaign.whatsappTargetDistributors,
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

function matchesSearch(row: AdminCampaignRow, search?: string) {
  if (!search?.trim()) return true;
  const q = search.trim().toLowerCase();
  return [row.name, row.product, row.description, row.badgeLabel, row.goal, row.reward]
    .filter(Boolean)
    .some((v) => String(v).toLowerCase().includes(q));
}

export async function listAdminCampaigns(db: D1Database, filters: CampaignFilters = {}) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));

  const { results } = await db
    .prepare(
      `SELECT pc.*, p.name as product_name, d.name as distributor_name
       FROM price_campaigns pc
       LEFT JOIN products p ON p.id = pc.product_id
       LEFT JOIN distributors d ON d.id = pc.distributor_id
       WHERE pc.deleted_at IS NULL`,
    )
    .all();

  let filtered = results.map(mapCampaign).filter((c) => matchesSearch(c, filters.search));
  if (filters.status && filters.status !== "all") {
    filtered = filtered.filter((c) => c.status === filters.status);
  }
  if (filters.active === "active") filtered = filtered.filter((c) => c.active);
  if (filters.active === "inactive") filtered = filtered.filter((c) => !c.active);

  filtered.sort((a, b) => b.startDate.localeCompare(a.startDate));
  const total = filtered.length;
  const offset = (page - 1) * pageSize;

  return {
    items: filtered.slice(offset, offset + pageSize),
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

export async function createCampaign(db: D1Database, input: CampaignInput, actorUserId: string) {
  if (!input.name?.trim()) throw new Error("Campaign name is required");

  const productId = await resolveProductId(db, input);
  const campaignId = input.id ?? id("pc");
  const status = input.status ?? "active";
  const startDate = normalizeCampaignDate(input.startDate);
  const endDate = normalizeCampaignDate(input.endDate);
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
  if (created) await sendCampaignNotifications(db, created);
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

export async function activateAdminCampaign(db: D1Database, campaignId: string, actorUserId: string) {
  const before = await loadCampaign(db, campaignId);
  if (!before) throw new Error("Campaign not found");

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
  if (after) await sendCampaignNotifications(db, after);
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

/** @deprecated Use createCampaign */
export const createPriceCampaign = createCampaign;
/** @deprecated Use updateCampaign */
export const updatePriceCampaign = updateCampaign;
