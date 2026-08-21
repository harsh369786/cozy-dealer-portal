import { id, nowIso } from "../utils";
import { writeAuditLog } from "./audit";
import { notifyCampaignPublished } from "./notification-events";

export type CampaignType = "price" | "sell" | "distributor";

export type AdminCampaignRow = {
  id: string;
  type: CampaignType;
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
  badgeLabel?: string;
  active: boolean;
  whatsappTargetDealers: boolean;
  whatsappTargetDistributors: boolean;
};

export type CampaignFilters = {
  search?: string;
  type?: CampaignType | "all";
  status?: string;
  active?: "all" | "active" | "inactive";
  page?: number;
  pageSize?: number;
};

export type PriceCampaignInput = {
  id?: string;
  type?: CampaignType;
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
};

function isActiveStatus(status: string) {
  return status === "active" || status === "upcoming";
}

async function sendCampaignNotifications(db: D1Database, campaign: AdminCampaignRow) {
  if (!isActiveStatus(campaign.status)) return;

  if (campaign.type === "price") {
    await notifyCampaignPublished(db, {
      campaignId: campaign.id,
      name: campaign.name,
      productName: campaign.product,
      discountPercent: campaign.discountPercent,
      targetDealers: campaign.whatsappTargetDealers,
      targetDistributors: campaign.whatsappTargetDistributors,
      distributorId: campaign.distributorId ?? null,
    });
    return;
  }

  await notifyCampaignPublished(db, {
    campaignId: campaign.id,
    name: campaign.name,
    productName: campaign.product,
    discountPercent: campaign.discountPercent,
    targetDealers: campaign.type === "distributor",
    targetDistributors: campaign.type === "distributor" || campaign.type === "sell",
    distributorId: campaign.distributorId ?? null,
  });
}

function mapPriceCampaign(r: Record<string, unknown>): AdminCampaignRow {
  const status = r.status as string;
  return {
    id: r.id as string,
    type: "price",
    name: r.name as string,
    product: (r.product_name as string) ?? (r.product_id as string),
    productId: r.product_id as string,
    discountPercent: r.discount_percent as number,
    description: (r.description as string) ?? "",
    startDate: (r.start_at as string)?.slice(0, 10) ?? "",
    endDate: (r.end_at as string)?.slice(0, 10) ?? "",
    status,
    badgeLabel: (r.badge_label as string) ?? undefined,
    active: isActiveStatus(status) && !r.deleted_at,
    whatsappTargetDealers: Boolean(r.whatsapp_target_dealers ?? 1),
    whatsappTargetDistributors: Boolean(r.whatsapp_target_distributors ?? 0),
  };
}

function mapSellCampaign(r: Record<string, unknown>): AdminCampaignRow {
  const status = r.status as string;
  return {
    id: r.id as string,
    type: "sell",
    name: r.title as string,
    product: "All products",
    goal: r.goal_text as string,
    reward: r.reward_text as string,
    target: r.target_count as number,
    done: r.done_count as number,
    description: r.goal_text as string,
    startDate: (r.starts_at as string)?.slice(0, 10) ?? "",
    endDate: (r.ends_at as string)?.slice(0, 10) ?? "",
    status,
    active: isActiveStatus(status) && !r.deleted_at,
    whatsappTargetDealers: Boolean(r.whatsapp_target_dealers ?? 1),
    whatsappTargetDistributors: Boolean(r.whatsapp_target_distributors ?? 0),
  };
}

function mapDistributorCampaign(r: Record<string, unknown>): AdminCampaignRow {
  const status = r.status as string;
  return {
    id: r.id as string,
    type: "distributor",
    name: r.name as string,
    product: r.product_name as string,
    distributorId: r.distributor_id as string,
    distributorName: (r.distributor_name as string) ?? undefined,
    description: r.description as string,
    startDate: r.start_date as string,
    endDate: r.end_date as string,
    status,
    badgeLabel: r.discount_label as string,
    active: isActiveStatus(status) && !r.deleted_at,
    whatsappTargetDealers: Boolean(r.whatsapp_target_dealers ?? 1),
    whatsappTargetDistributors: Boolean(r.whatsapp_target_distributors ?? 0),
  };
}

async function loadCampaign(db: D1Database, campaignId: string): Promise<AdminCampaignRow | null> {
  const price = await db
    .prepare(
      `SELECT pc.*, p.name as product_name FROM price_campaigns pc
       LEFT JOIN products p ON p.id = pc.product_id
       WHERE pc.id = ? AND pc.deleted_at IS NULL`,
    )
    .bind(campaignId)
    .first<Record<string, unknown>>();
  if (price) return mapPriceCampaign(price);

  const sell = await db
    .prepare(`SELECT * FROM sell_campaigns WHERE id = ? AND deleted_at IS NULL`)
    .bind(campaignId)
    .first<Record<string, unknown>>();
  if (sell) return mapSellCampaign(sell);

  const dist = await db
    .prepare(
      `SELECT dc.*, d.name as distributor_name FROM distributor_campaigns dc
       LEFT JOIN distributors d ON d.id = dc.distributor_id
       WHERE dc.id = ? AND dc.deleted_at IS NULL`,
    )
    .bind(campaignId)
    .first<Record<string, unknown>>();
  if (dist) return mapDistributorCampaign(dist);

  return null;
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

  const items: AdminCampaignRow[] = [];
  const type = filters.type ?? "all";

  if (type === "all" || type === "price") {
    const { results } = await db
      .prepare(
        `SELECT pc.*, p.name as product_name FROM price_campaigns pc
         LEFT JOIN products p ON p.id = pc.product_id
         WHERE pc.deleted_at IS NULL`,
      )
      .all();
    items.push(...results.map(mapPriceCampaign));
  }
  if (type === "all" || type === "sell") {
    const { results } = await db
      .prepare(`SELECT * FROM sell_campaigns WHERE deleted_at IS NULL`)
      .all();
    items.push(...results.map(mapSellCampaign));
  }
  if (type === "all" || type === "distributor") {
    const { results } = await db
      .prepare(
        `SELECT dc.*, d.name as distributor_name FROM distributor_campaigns dc
         LEFT JOIN distributors d ON d.id = dc.distributor_id
         WHERE dc.deleted_at IS NULL`,
      )
      .all();
    items.push(...results.map(mapDistributorCampaign));
  }

  let filtered = items.filter((c) => matchesSearch(c, filters.search));
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

export async function createPriceCampaign(
  db: D1Database,
  input: PriceCampaignInput,
  actorUserId: string,
) {
  if (!input.name?.trim()) throw new Error("Campaign name is required");
  if (!input.productId && !input.product) throw new Error("Product is required");

  let productId = input.productId;
  if (!productId && input.product) {
    const product = await db
      .prepare(`SELECT id FROM products WHERE name = ? AND deleted_at IS NULL LIMIT 1`)
      .bind(input.product)
      .first<{ id: string }>();
    productId = product?.id;
  }
  if (!productId) throw new Error("Product not found");

  const campaignId = input.id ?? id("pc");
  const status = input.status ?? "active";
  await db
    .prepare(
      `INSERT INTO price_campaigns (id, name, product_id, discount_percent, start_at, end_at, description, terms, badge_label, status, whatsapp_target_dealers, whatsapp_target_distributors)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      campaignId,
      input.name.trim(),
      productId,
      input.discountPercent ?? 0,
      input.startDate,
      input.endDate,
      input.description ?? "",
      input.terms ?? null,
      input.badgeLabel ?? null,
      status,
      input.whatsappTargetDealers === false ? 0 : 1,
      input.whatsappTargetDistributors ? 1 : 0,
    )
    .run();

  const created = await loadCampaign(db, campaignId);
  await writeAuditLog(db, {
    actorUserId,
    action: "campaign.create",
    entityType: "price_campaign",
    entityId: campaignId,
    after: created,
  });
  if (created) await sendCampaignNotifications(db, created);
  return created!;
}

export async function updatePriceCampaign(
  db: D1Database,
  campaignId: string,
  input: PriceCampaignInput,
  actorUserId: string,
) {
  const before = await loadCampaign(db, campaignId);
  if (!before || before.type !== "price") throw new Error("Price campaign not found");

  let productId = input.productId ?? before.productId;
  if (!productId && input.product) {
    const product = await db
      .prepare(`SELECT id FROM products WHERE name = ? AND deleted_at IS NULL LIMIT 1`)
      .bind(input.product)
      .first<{ id: string }>();
    productId = product?.id;
  }

  await db
    .prepare(
      `UPDATE price_campaigns SET name = ?, product_id = ?, discount_percent = ?, start_at = ?, end_at = ?,
       description = ?, terms = ?, badge_label = ?, status = ?,
       whatsapp_target_dealers = ?, whatsapp_target_distributors = ?
       WHERE id = ? AND deleted_at IS NULL`,
    )
    .bind(
      input.name.trim(),
      productId,
      input.discountPercent ?? before.discountPercent ?? 0,
      input.startDate,
      input.endDate,
      input.description ?? before.description,
      input.terms ?? null,
      input.badgeLabel ?? before.badgeLabel ?? null,
      input.status ?? before.status,
      input.whatsappTargetDealers === false ? 0 : 1,
      input.whatsappTargetDistributors ? 1 : 0,
      campaignId,
    )
    .run();

  const after = await loadCampaign(db, campaignId);
  await writeAuditLog(db, {
    actorUserId,
    action: "campaign.update",
    entityType: "price_campaign",
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
  if (before.type === "price") {
    await db
      .prepare(`UPDATE price_campaigns SET status = 'expired', deleted_at = ? WHERE id = ?`)
      .bind(ts, campaignId)
      .run();
  } else if (before.type === "sell") {
    await db
      .prepare(`UPDATE sell_campaigns SET status = 'expired', deleted_at = ? WHERE id = ?`)
      .bind(ts, campaignId)
      .run();
  } else {
    await db
      .prepare(`UPDATE distributor_campaigns SET status = 'expired', deleted_at = ? WHERE id = ?`)
      .bind(ts, campaignId)
      .run();
  }

  await writeAuditLog(db, {
    actorUserId,
    action: "campaign.archive",
    entityType: before.type + "_campaign",
    entityId: campaignId,
    before,
    after: { status: "expired", deletedAt: ts },
  });
  return { ok: true };
}

export async function activateAdminCampaign(db: D1Database, campaignId: string, actorUserId: string) {
  const before = await loadCampaign(db, campaignId);
  if (!before) throw new Error("Campaign not found");

  if (before.type === "price") {
    await db
      .prepare(`UPDATE price_campaigns SET status = 'active', deleted_at = NULL WHERE id = ?`)
      .bind(campaignId)
      .run();
  } else if (before.type === "sell") {
    await db
      .prepare(`UPDATE sell_campaigns SET status = 'active', deleted_at = NULL WHERE id = ?`)
      .bind(campaignId)
      .run();
  } else {
    await db
      .prepare(`UPDATE distributor_campaigns SET status = 'active', deleted_at = NULL WHERE id = ?`)
      .bind(campaignId)
      .run();
  }

  const after = await loadCampaign(db, campaignId);
  await writeAuditLog(db, {
    actorUserId,
    action: "campaign.activate",
    entityType: before.type + "_campaign",
    entityId: campaignId,
    before,
    after,
  });
  if (after) await sendCampaignNotifications(db, after);
  return after!;
}
