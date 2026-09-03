import { id, nowIso } from "../utils";

export const DEFAULT_PRICING_TIER_ID = "tier-t1";

/** Dealer Price = MRP x (1 - dealerMargin%/100), rounded half-up to the nearest rupee. */
export function calculateDealerPrice(mrp: number, dealerMarginPercent: number): number {
  const base = Math.max(0, Number(mrp) || 0);
  const margin = Number(dealerMarginPercent) || 0;
  const clamped = Math.min(100, Math.max(0, margin));
  return Math.round(base * (1 - clamped / 100));
}

/** Distributor Price = Dealer Price / (1 + distributorMargin%/100), rounded half-up. */
export function calculateDistributorPrice(dealerPrice: number, marginPercent: number): number {
  const dealer = Math.max(0, Number(dealerPrice) || 0);
  const margin = Number(marginPercent);
  if (!Number.isFinite(margin) || margin <= -100) {
    throw new Error("Distributor margin must be greater than -100%");
  }
  return Math.round(dealer / (1 + margin / 100));
}

let tiersTableCache: boolean | undefined;

export async function hasPricingTiers(db: D1Database): Promise<boolean> {
  if (tiersTableCache) return true;
  const row = await db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'pricing_tiers' LIMIT 1`)
    .first<{ name: string }>();
  if (row) tiersTableCache = true;
  return Boolean(row);
}

export type PricingTierRow = {
  id: string;
  code: string;
  name: string;
  distributorMarginPercent: number;
  sortOrder: number;
};

export type PricingContext = {
  tierId: string;
  code: string;
  /** Tier-level fallback distributor margin (used when a product has no per-product value). */
  distributorMarginPercent: number;
  /** Per-product dealer margin % for this tier. */
  dealerMarginByProduct: Map<string, number>;
  /** Per-product distributor margin % for this tier. */
  distributorMarginByProduct: Map<string, number>;
};

function mapTier(row: {
  id: string;
  code: string;
  name: string;
  distributor_margin_percent: number;
  sort_order: number;
}): PricingTierRow {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    distributorMarginPercent: Number(row.distributor_margin_percent),
    sortOrder: Number(row.sort_order),
  };
}

export async function listPricingTiers(db: D1Database): Promise<PricingTierRow[]> {
  if (!(await hasPricingTiers(db))) return [];
  const { results } = await db
    .prepare(
      `SELECT id, code, name, distributor_margin_percent, sort_order
       FROM pricing_tiers WHERE deleted_at IS NULL ORDER BY sort_order, code`,
    )
    .all<{
      id: string;
      code: string;
      name: string;
      distributor_margin_percent: number;
      sort_order: number;
    }>();
  return results.map(mapTier);
}

export async function getPricingTier(db: D1Database, tierId: string): Promise<PricingTierRow | null> {
  if (!(await hasPricingTiers(db))) return null;
  const row = await db
    .prepare(
      `SELECT id, code, name, distributor_margin_percent, sort_order
       FROM pricing_tiers WHERE id = ? AND deleted_at IS NULL`,
    )
    .bind(tierId)
    .first<{
      id: string;
      code: string;
      name: string;
      distributor_margin_percent: number;
      sort_order: number;
    }>();
  return row ? mapTier(row) : null;
}

export async function savePricingTier(
  db: D1Database,
  input: { id?: string; code: string; name: string; distributorMarginPercent: number; sortOrder?: number },
) {
  if (!(await hasPricingTiers(db))) throw new Error("Pricing tiers are not available");
  const code = input.code.trim().toUpperCase();
  if (!code) throw new Error("Tier code is required");
  const margin = Number(input.distributorMarginPercent);
  if (!Number.isFinite(margin) || margin <= -100) throw new Error("Invalid distributor margin %");
  const name = input.name.trim() || code;
  const ts = nowIso();

  if (input.id) {
    await db
      .prepare(
        `UPDATE pricing_tiers SET code = ?, name = ?, distributor_margin_percent = ?, sort_order = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
      )
      .bind(code, name, margin, input.sortOrder ?? 0, ts, input.id)
      .run();
    const updated = await getPricingTier(db, input.id);
    if (!updated) throw new Error("Pricing tier not found");
    return updated;
  }

  const newId = id("tier");
  const maxSort = await db
    .prepare(`SELECT COALESCE(MAX(sort_order), 0) as n FROM pricing_tiers WHERE deleted_at IS NULL`)
    .first<{ n: number }>();
  await db
    .prepare(
      `INSERT INTO pricing_tiers (id, code, name, distributor_margin_percent, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(newId, code, name, margin, input.sortOrder ?? (maxSort?.n ?? 0) + 1, ts, ts)
    .run();

  await db
    .prepare(
      `INSERT OR IGNORE INTO pricing_tier_product_prices
         (tier_id, product_id, dealer_price, dealer_margin_percent, distributor_margin_percent)
       SELECT ?, product_id, dealer_price, dealer_margin_percent, distributor_margin_percent
       FROM pricing_tier_product_prices WHERE tier_id = ?`,
    )
    .bind(newId, DEFAULT_PRICING_TIER_ID)
    .run();

  return (await getPricingTier(db, newId))!;
}

export async function deletePricingTier(db: D1Database, tierId: string) {
  if (tierId === DEFAULT_PRICING_TIER_ID) throw new Error("The default T1 tier cannot be deleted");
  const ts = nowIso();
  await db
    .prepare(`UPDATE dealers SET pricing_tier_id = ? WHERE pricing_tier_id = ?`)
    .bind(DEFAULT_PRICING_TIER_ID, tierId)
    .run();
  await db
    .prepare(`UPDATE distributors SET pricing_tier_id = ? WHERE pricing_tier_id = ?`)
    .bind(DEFAULT_PRICING_TIER_ID, tierId)
    .run();
  await db.prepare(`UPDATE pricing_tiers SET deleted_at = ?, updated_at = ? WHERE id = ?`).bind(ts, ts, tierId).run();
}

export type TierProductMargins = {
  tierId: string;
  code: string;
  name: string;
  dealerMarginPercent: number;
  distributorMarginPercent: number;
};

/** Upsert the per-product margins for a single tier. */
export async function upsertTierProductMargins(
  db: D1Database,
  tierId: string,
  productId: string,
  input: { dealerMarginPercent: number; distributorMarginPercent: number },
) {
  if (!(await hasPricingTiers(db))) return;
  const dealerMargin = clampPercent(input.dealerMarginPercent, 0, 100);
  const distributorMargin = clampPercent(input.distributorMarginPercent, 0, 100000);
  await db
    .prepare(
      `INSERT INTO pricing_tier_product_prices
         (tier_id, product_id, dealer_price, dealer_margin_percent, distributor_margin_percent)
       VALUES (?, ?, 0, ?, ?)
       ON CONFLICT(tier_id, product_id) DO UPDATE SET
         dealer_margin_percent = excluded.dealer_margin_percent,
         distributor_margin_percent = excluded.distributor_margin_percent`,
    )
    .bind(tierId, productId, dealerMargin, distributorMargin)
    .run();
}

function clampPercent(value: unknown, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/**
 * Per-tier margins for a product. Falls back to the tier's distributor margin when a
 * per-product distributor margin has not been set yet, and 0 dealer margin otherwise.
 */
export async function listProductTierPrices(db: D1Database, productId: string) {
  const tiers = await listPricingTiers(db);
  if (!tiers.length) return [];
  const { results } = await db
    .prepare(
      `SELECT tier_id, dealer_margin_percent, distributor_margin_percent
       FROM pricing_tier_product_prices WHERE product_id = ?`,
    )
    .bind(productId)
    .all<{ tier_id: string; dealer_margin_percent: number | null; distributor_margin_percent: number | null }>();
  const byTier = new Map(results.map((r) => [r.tier_id, r]));
  return tiers.map((tier): TierProductMargins => {
    const row = byTier.get(tier.id);
    return {
      tierId: tier.id,
      code: tier.code,
      name: tier.name,
      dealerMarginPercent: row?.dealer_margin_percent != null ? Number(row.dealer_margin_percent) : 0,
      distributorMarginPercent:
        row?.distributor_margin_percent != null
          ? Number(row.distributor_margin_percent)
          : tier.distributorMarginPercent,
    };
  });
}

/** Persist per-product margins for every tier at once (used from the product editor save). */
export async function saveProductTierMargins(
  db: D1Database,
  productId: string,
  rows: Array<{ tierId: string; dealerMarginPercent: number; distributorMarginPercent: number }>,
) {
  if (!rows.length || !(await hasPricingTiers(db))) return;
  await db.batch(
    rows.map((row) =>
      db
        .prepare(
          `INSERT INTO pricing_tier_product_prices
             (tier_id, product_id, dealer_price, dealer_margin_percent, distributor_margin_percent)
           VALUES (?, ?, 0, ?, ?)
           ON CONFLICT(tier_id, product_id) DO UPDATE SET
             dealer_margin_percent = excluded.dealer_margin_percent,
             distributor_margin_percent = excluded.distributor_margin_percent`,
        )
        .bind(
          row.tierId,
          productId,
          clampPercent(row.dealerMarginPercent, 0, 100),
          clampPercent(row.distributorMarginPercent, 0, 100000),
        ),
    ),
  );
}

async function loadMarginsForTier(db: D1Database, tierId: string) {
  const dealer = new Map<string, number>();
  const distributor = new Map<string, number>();
  const { results } = await db
    .prepare(
      `SELECT product_id, dealer_margin_percent, distributor_margin_percent
       FROM pricing_tier_product_prices WHERE tier_id = ?`,
    )
    .bind(tierId)
    .all<{ product_id: string; dealer_margin_percent: number | null; distributor_margin_percent: number | null }>();
  for (const row of results) {
    if (row.dealer_margin_percent != null) dealer.set(row.product_id, Number(row.dealer_margin_percent));
    if (row.distributor_margin_percent != null)
      distributor.set(row.product_id, Number(row.distributor_margin_percent));
  }
  return { dealer, distributor };
}

export async function resolvePricingContext(
  db: D1Database,
  opts: { dealerId?: string | null; distributorId?: string | null; pricingTierId?: string | null },
): Promise<PricingContext | null> {
  if (!(await hasPricingTiers(db))) return null;

  let tierId = opts.pricingTierId ?? null;
  if (!tierId && opts.dealerId) {
    const row = await db
      .prepare(`SELECT pricing_tier_id FROM dealers WHERE id = ?`)
      .bind(opts.dealerId)
      .first<{ pricing_tier_id: string | null }>();
    tierId = row?.pricing_tier_id ?? null;
  }
  if (!tierId && opts.distributorId) {
    const row = await db
      .prepare(`SELECT pricing_tier_id FROM distributors WHERE id = ?`)
      .bind(opts.distributorId)
      .first<{ pricing_tier_id: string | null }>();
    tierId = row?.pricing_tier_id ?? null;
  }
  tierId = tierId || DEFAULT_PRICING_TIER_ID;

  const tier = await getPricingTier(db, tierId);
  const fallback = (await getPricingTier(db, DEFAULT_PRICING_TIER_ID)) ?? {
    id: DEFAULT_PRICING_TIER_ID,
    code: "T1",
    name: "Tier 1",
    distributorMarginPercent: 20,
    sortOrder: 1,
  };
  const active = tier ?? fallback;

  const margins = await loadMarginsForTier(db, active.id);

  return {
    tierId: active.id,
    code: active.code,
    distributorMarginPercent: active.distributorMarginPercent,
    dealerMarginByProduct: margins.dealer,
    distributorMarginByProduct: margins.distributor,
  };
}

/**
 * Resolve the effective margins for a product under a pricing context. Distributor
 * margin falls back to the tier-level margin when no per-product value exists; dealer
 * margin falls back to 0 (i.e. dealer pays MRP) so a missing config never over-discounts.
 */
export function marginsFromContext(
  ctx: PricingContext | null,
  productId: string,
): { dealerMarginPercent: number; distributorMarginPercent: number } {
  if (!ctx) return { dealerMarginPercent: 0, distributorMarginPercent: 20 };
  return {
    dealerMarginPercent: ctx.dealerMarginByProduct.get(productId) ?? 0,
    distributorMarginPercent:
      ctx.distributorMarginByProduct.get(productId) ?? ctx.distributorMarginPercent,
  };
}

export async function assignPricingTier(
  db: D1Database,
  target: { dealerId?: string | null; distributorId?: string | null },
  tierId: string,
) {
  const tier = await getPricingTier(db, tierId);
  if (!tier) throw new Error("Pricing tier not found");
  if (target.dealerId) {
    await db.prepare(`UPDATE dealers SET pricing_tier_id = ?, updated_at = ? WHERE id = ?`).bind(tierId, nowIso(), target.dealerId).run();
  }
  if (target.distributorId) {
    await db
      .prepare(`UPDATE distributors SET pricing_tier_id = ?, updated_at = ? WHERE id = ?`)
      .bind(tierId, nowIso(), target.distributorId)
      .run();
  }
}
