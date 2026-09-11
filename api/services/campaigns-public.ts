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
  // Only expose the linked product when it STILL EXISTS. `product_name` comes from a LEFT JOIN on
  // products, so a NULL name means the campaign's product_id is stale (product deleted/renamed to a
  // new id). Surfacing that stale id makes the "Order product" deep link 404. Dropping it here lets
  // the client fall back to the generic "View products" action instead of a dead link.
  const productExists = r.product_name != null && String(r.product_name).trim() !== "";
  return {
    id: r.id as string,
    name: r.name as string,
    productId: productExists ? (r.product_id as string) : undefined,
    productName: productExists ? (r.product_name as string) : undefined,
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

// Bucket filter computed PURELY from the date window in IST (date('now','+05:30')). The stored
// status column is intentionally NOT consulted, so campaigns move between tabs automatically:
//   active   = start <= today <= end
//   upcoming = today < start
//   expired  = today > end
function campaignTabSql(tab: CampaignStatus) {
  if (tab === "active") {
    return ` AND date(substr(pc.start_at, 1, 10)) <= date('now', '+05:30')
              AND date(substr(pc.end_at, 1, 10)) >= date('now', '+05:30')`;
  }
  if (tab === "upcoming") {
    return ` AND date(substr(pc.start_at, 1, 10)) > date('now', '+05:30')`;
  }
  return ` AND date(substr(pc.end_at, 1, 10)) < date('now', '+05:30')`;
}

export async function listDealerCampaigns(
  db: D1Database,
  tab: CampaignStatus = "active",
  distributorId?: string | null,
) {
  // Distributor scoping: a dealer must only see GLOBAL campaigns (distributor_id IS NULL) plus
  // campaigns targeted at THEIR distributor — never another distributor's targeted campaign. When
  // no distributor is known (e.g. an admin-facing call), fall back to global-only to avoid bleed.
  let scopeSql: string;
  const binds: unknown[] = [];
  if (distributorId) {
    scopeSql = ` AND (pc.distributor_id IS NULL OR pc.distributor_id = ?)`;
    binds.push(distributorId);
  } else {
    scopeSql = ` AND pc.distributor_id IS NULL`;
  }

  const { results } = await db
    .prepare(
      `SELECT pc.*, p.name as product_name FROM price_campaigns pc
       LEFT JOIN products p ON p.id = pc.product_id
       WHERE pc.deleted_at IS NULL AND pc.whatsapp_target_dealers = 1${scopeSql}${campaignTabSql(tab)}
       ORDER BY date(substr(pc.start_at, 1, 10)) DESC, pc.id DESC`,
    )
    .bind(...binds)
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
  sql += ` ORDER BY date(substr(pc.start_at, 1, 10)) DESC, pc.id DESC`;
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
  options?: { campaignId?: string; at?: Date; distributorId?: string | null },
) {
  const at = options?.at ?? new Date();
  const today = istTodayIso(at);

  // Distributor scoping to prevent cross-bleed: only a global campaign (distributor_id IS NULL) or
  // one targeted at this dealer's distributor may price their order. When distributorId is unknown,
  // restrict to global-only.
  const distributorClause = options?.distributorId
    ? ` AND (pc.distributor_id IS NULL OR pc.distributor_id = ?)`
    : ` AND pc.distributor_id IS NULL`;

  if (options?.campaignId) {
    // Match the product via the legacy single product_id, the all-products sentinel (NULL), OR the
    // multi-product join table (price_campaign_products). Legacy single-product campaigns have no
    // join rows, so the product_id branch still matches them.
    const binds: unknown[] = [options.campaignId, productId, productId];
    if (options.distributorId) binds.push(options.distributorId);
    const row = await db
      .prepare(
        `SELECT pc.*, p.name as product_name FROM price_campaigns pc
         LEFT JOIN products p ON p.id = pc.product_id
         WHERE pc.id = ?
           AND (
             pc.product_id = ? OR pc.product_id IS NULL
             OR pc.id IN (SELECT campaign_id FROM price_campaign_products WHERE product_id = ?)
           )
           AND pc.deleted_at IS NULL${distributorClause}`,
      )
      .bind(...binds)
      .first<Record<string, unknown>>();
    if (!row) return null;
    const startDate = readCampaignDate(row.start_at);
    const endDate = readCampaignDate(row.end_at);
    if (!startDate || !endDate) return null;
    if (!isCampaignLive(String(row.status), startDate, endDate, at)) return null;
    return row;
  }

  // Match product-specific (legacy product_id OR the multi-product join table) OR all-products
  // (product_id IS NULL) campaigns. A product-specific campaign wins over an all-products one.
  // `is_all_products` is 1 only when the campaign has no specific target for THIS product (neither
  // product_id nor a join row), so those sort last.
  const binds: unknown[] = [productId, productId, productId, productId];
  if (options?.distributorId) binds.push(options.distributorId);
  binds.push(today, today);
  return db
    .prepare(
      `SELECT pc.*, p.name as product_name,
         CASE WHEN pc.product_id = ? OR pc.id IN (
           SELECT campaign_id FROM price_campaign_products WHERE product_id = ?
         ) THEN 0 ELSE 1 END AS is_all_products
       FROM price_campaigns pc
       LEFT JOIN products p ON p.id = pc.product_id
       WHERE (
           pc.product_id = ? OR pc.product_id IS NULL
           OR pc.id IN (SELECT campaign_id FROM price_campaign_products WHERE product_id = ?)
         ) AND pc.deleted_at IS NULL${distributorClause}
         AND date(pc.start_at) <= date(?)
         AND date(pc.end_at) >= date(?)
       ORDER BY is_all_products ASC, pc.start_at DESC LIMIT 1`,
    )
    .bind(...binds)
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
