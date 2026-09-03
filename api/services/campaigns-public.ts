import {
  getEffectiveCampaignStatus,
  isCampaignLive,
  matchesCampaignTab,
  readCampaignDate,
  type CampaignStatus,
} from "./campaign-utils";
import { istTodayIso } from "../utils";

export type PublicCampaign = {
  id: string;
  name: string;
  productId?: string;
  productName?: string;
  discountPercent?: number;
  description: string;
  badgeLabel?: string;
  startDate: string;
  endDate: string;
  status: CampaignStatus;
  imageUrl?: string;
  target?: number;
  done?: number;
  distributorId?: string;
};

function mapCampaignRow(r: Record<string, unknown>): PublicCampaign {
  const startDate = readCampaignDate(r.start_at);
  const endDate = readCampaignDate(r.end_at);
  const storedStatus = String(r.status ?? "active");
  const discountPercent = Number(r.discount_percent ?? 0);
  return {
    id: r.id as string,
    name: r.name as string,
    productId: (r.product_id as string) ?? undefined,
    productName: (r.product_name as string) ?? undefined,
    discountPercent: discountPercent > 0 ? discountPercent : undefined,
    description: String(r.description ?? ""),
    badgeLabel: (r.badge_label as string) ?? undefined,
    startDate,
    endDate,
    status: getEffectiveCampaignStatus(storedStatus, startDate, endDate),
    imageUrl: (r.image_url as string) ?? undefined,
    target: (r.target_count as number) ?? undefined,
    done: (r.done_count as number) ?? undefined,
    distributorId: (r.distributor_id as string) ?? undefined,
  };
}

function campaignTabSql(tab: CampaignStatus) {
  if (tab === "active") {
    return ` AND date(substr(pc.start_at, 1, 10)) <= date('now', '+05:30')
              AND date(substr(pc.end_at, 1, 10)) >= date('now', '+05:30')
              AND IFNULL(pc.status, 'active') != 'expired'`;
  }
  if (tab === "upcoming") {
    return ` AND date(substr(pc.end_at, 1, 10)) >= date('now', '+05:30')
              AND (date(substr(pc.start_at, 1, 10)) > date('now', '+05:30') OR pc.status = 'upcoming')`;
  }
  return ` AND (date(substr(pc.end_at, 1, 10)) < date('now', '+05:30') OR pc.status = 'expired')`;
}

export async function listDealerCampaigns(db: D1Database, tab: CampaignStatus = "active") {
  const { results } = await db
    .prepare(
      `SELECT pc.*, p.name as product_name FROM price_campaigns pc
       LEFT JOIN products p ON p.id = pc.product_id
       WHERE pc.deleted_at IS NULL AND pc.whatsapp_target_dealers = 1${campaignTabSql(tab)}`,
    )
    .all();

  return results
    .map(mapCampaignRow)
    .filter((c) => matchesCampaignTab(c.status, tab));
}

export async function listDistributorCampaigns(
  db: D1Database,
  distributorId: string | undefined,
  tab?: CampaignStatus,
) {
  let sql = `SELECT pc.*, p.name as product_name FROM price_campaigns pc
    LEFT JOIN products p ON p.id = pc.product_id
    WHERE pc.deleted_at IS NULL
      AND (pc.whatsapp_target_dealers = 1 OR pc.whatsapp_target_distributors = 1)`;
  const binds: unknown[] = [];
  if (distributorId) {
    sql += ` AND (pc.distributor_id IS NULL OR pc.distributor_id = ?)`;
    binds.push(distributorId);
  } else {
    // No distributor scope: only show global (unassigned) campaigns, never another
    // distributor's targeted campaigns.
    sql += ` AND pc.distributor_id IS NULL`;
  }
  if (tab) sql += campaignTabSql(tab);
  const { results } = await db.prepare(sql).bind(...binds).all();

  return results
    .map(mapCampaignRow)
    .filter((c) => (tab ? matchesCampaignTab(c.status, tab) : true));
}

export async function getPublicCampaignById(db: D1Database, campaignId: string) {
  const row = await db
    .prepare(
      `SELECT pc.*, p.name as product_name FROM price_campaigns pc
       LEFT JOIN products p ON p.id = pc.product_id
       WHERE pc.id = ? AND pc.deleted_at IS NULL`,
    )
    .bind(campaignId)
    .first<Record<string, unknown>>();
  return row ? mapCampaignRow(row) : null;
}

export async function getActivePriceCampaignRow(
  db: D1Database,
  productId: string,
  options?: { campaignId?: string; at?: Date },
) {
  const at = options?.at ?? new Date();
  const today = istTodayIso(at);

  if (options?.campaignId) {
    const row = await db
      .prepare(
        `SELECT pc.*, p.name as product_name FROM price_campaigns pc
         LEFT JOIN products p ON p.id = pc.product_id
         WHERE pc.id = ? AND (pc.product_id = ? OR pc.product_id IS NULL) AND pc.deleted_at IS NULL`,
      )
      .bind(options.campaignId, productId)
      .first<Record<string, unknown>>();
    if (!row) return null;
    const startDate = readCampaignDate(row.start_at);
    const endDate = readCampaignDate(row.end_at);
    if (!startDate || !endDate) return null;
    if (!isCampaignLive(String(row.status), startDate, endDate, at)) return null;
    return row;
  }

  // Match product-specific OR all-products (product_id IS NULL) campaigns.
  // A product-specific campaign wins over an all-products one (product_id IS NULL sorts last).
  return db
    .prepare(
      `SELECT pc.*, p.name as product_name FROM price_campaigns pc
       LEFT JOIN products p ON p.id = pc.product_id
       WHERE (pc.product_id = ? OR pc.product_id IS NULL) AND pc.deleted_at IS NULL
         AND pc.status = 'active'
         AND date(pc.start_at) <= date(?)
         AND date(pc.end_at) >= date(?)
       ORDER BY (pc.product_id IS NULL) ASC, pc.start_at DESC LIMIT 1`,
    )
    .bind(productId, today, today)
    .first<Record<string, unknown>>();
}

/** @deprecated Use PublicCampaign */
export type PublicPriceCampaign = PublicCampaign & { type: "price" };
/** @deprecated Use PublicCampaign */
export type PublicSellCampaign = never;
/** @deprecated Use PublicCampaign */
export type PublicDistributorCampaign = PublicCampaign & {
  product: string;
  discountLabel: string;
  bannerEmoji: string;
};

/** @deprecated Use mapCampaignRow internally */
export function mapDistributorRow(r: Record<string, unknown>): PublicCampaign {
  return mapCampaignRow(r);
}
