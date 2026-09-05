// Per-product, per-thickness MRP ₹/sqft rates for mattress pricing (table product_sqft_rates,
// migration 0035). Read at runtime by buildPriceQuote; managed via the product editor.
//
// Distinct from the legacy guarantee-keyed mattress_sqft_rates (0018), which only bakes
// product_prices when an admin clicks "recalculate" and is not read at runtime.

import { nowIso } from "../utils";

export type ProductSqftRate = {
  thickness: string;
  mrpPerSqft: number;
};

/**
 * A mattress is any product whose category is NOT Pillows/Foldable. Mirrors the isMattress logic
 * used on the dealer product page. Sqft pricing applies only to mattresses.
 */
export function isMattressCategory(category?: string | null): boolean {
  return category !== "Pillows" && category !== "Foldable";
}

function mapRow(row: Record<string, unknown>): ProductSqftRate {
  return {
    thickness: String(row.thickness),
    mrpPerSqft: Number(row.mrp_per_sqft),
  };
}

/**
 * Runtime lookup for a single (product, thickness) MRP rate. Returns null when none is configured
 * or the value is not a positive number. Tolerant of the table not existing yet (before the
 * migration is applied) so pricing never hard-fails at the query level.
 */
export async function getProductSqftRate(
  db: D1Database,
  productId: string,
  thickness: string,
): Promise<number | null> {
  try {
    const row = await db
      .prepare(`SELECT mrp_per_sqft FROM product_sqft_rates WHERE product_id = ? AND thickness = ?`)
      .bind(productId, thickness.trim())
      .first<Record<string, unknown>>();
    if (!row) return null;
    const mrpPerSqft = Number(row.mrp_per_sqft);
    if (!Number.isFinite(mrpPerSqft) || mrpPerSqft <= 0) return null;
    return mrpPerSqft;
  } catch {
    return null;
  }
}

/** All configured rates for a product (used by the admin editor + completeness checks). */
export async function listProductSqftRates(
  db: D1Database,
  productId: string,
): Promise<ProductSqftRate[]> {
  try {
    const { results } = await db
      .prepare(
        `SELECT thickness, mrp_per_sqft FROM product_sqft_rates WHERE product_id = ? ORDER BY thickness`,
      )
      .bind(productId)
      .all<Record<string, unknown>>();
    return results.map(mapRow);
  } catch {
    return [];
  }
}

/** Set of thicknesses that have a positive rate, for one product. */
export async function ratedThicknessesFor(db: D1Database, productId: string): Promise<Set<string>> {
  const rates = await listProductSqftRates(db, productId);
  return new Set(
    rates.filter((r) => Number.isFinite(r.mrpPerSqft) && r.mrpPerSqft > 0).map((r) => r.thickness),
  );
}

/**
 * True when the product has a positive MRP ₹/sqft rate for EVERY thickness in `thicknesses`.
 * A mattress must satisfy this to be active/visible. An empty thickness list is treated as
 * incomplete (a mattress with no thickness/rate cannot be priced).
 */
export async function hasCompleteSqftRates(
  db: D1Database,
  productId: string,
  thicknesses: string[],
): Promise<boolean> {
  const cleaned = thicknesses.map((t) => t.trim()).filter(Boolean);
  if (cleaned.length === 0) return false;
  const rated = await ratedThicknessesFor(db, productId);
  return cleaned.every((t) => rated.has(t));
}

/**
 * Batch completeness check. Given products with their category + thickness list, returns the set of
 * product IDs that are OK to show/price: non-mattresses always pass; a mattress passes only when it
 * has a positive rate for every one of its thicknesses (and has at least one thickness). Uses a
 * single query over product_sqft_rates instead of one per product.
 */
export async function completeProductIds(
  db: D1Database,
  products: Array<{ id: string; category?: string | null; thicknesses: string[] }>,
): Promise<Set<string>> {
  const mattressIds = products
    .filter((p) => isMattressCategory(p.category))
    .map((p) => p.id);
  const ratesByProduct = new Map<string, Set<string>>();
  if (mattressIds.length > 0) {
    try {
      const placeholders = mattressIds.map(() => "?").join(",");
      const { results } = await db
        .prepare(
          `SELECT product_id, thickness, mrp_per_sqft FROM product_sqft_rates
           WHERE product_id IN (${placeholders})`,
        )
        .bind(...mattressIds)
        .all<Record<string, unknown>>();
      for (const row of results) {
        const rate = Number(row.mrp_per_sqft);
        if (!Number.isFinite(rate) || rate <= 0) continue;
        const pid = String(row.product_id);
        if (!ratesByProduct.has(pid)) ratesByProduct.set(pid, new Set());
        ratesByProduct.get(pid)!.add(String(row.thickness));
      }
    } catch {
      // Table missing: no mattress has rates yet -> all mattresses are incomplete.
    }
  }

  const ok = new Set<string>();
  for (const p of products) {
    if (!isMattressCategory(p.category)) {
      ok.add(p.id);
      continue;
    }
    const thicknesses = p.thicknesses.map((t) => t.trim()).filter(Boolean);
    if (thicknesses.length === 0) continue;
    const rated = ratesByProduct.get(p.id);
    if (rated && thicknesses.every((t) => rated.has(t))) ok.add(p.id);
  }
  return ok;
}

/**
 * Replace all rates for a product. A row is kept only when the rate is a positive number and its
 * thickness is one of the product's current thicknesses; others are dropped. Runs as one batch so
 * the set is replaced atomically.
 */
export async function saveProductSqftRates(
  db: D1Database,
  productId: string,
  rates: ProductSqftRate[],
  allowedThicknesses?: string[],
): Promise<void> {
  const ts = nowIso();
  const allowed = allowedThicknesses
    ? new Set(allowedThicknesses.map((t) => t.trim()).filter(Boolean))
    : null;
  const statements: D1PreparedStatement[] = [
    db.prepare(`DELETE FROM product_sqft_rates WHERE product_id = ?`).bind(productId),
  ];
  const seen = new Set<string>();
  for (const rate of rates) {
    const thickness = rate.thickness?.trim();
    if (!thickness || seen.has(thickness)) continue;
    if (allowed && !allowed.has(thickness)) continue;
    const mrpPerSqft = Number(rate.mrpPerSqft);
    if (!Number.isFinite(mrpPerSqft) || mrpPerSqft <= 0) continue;
    seen.add(thickness);
    statements.push(
      db
        .prepare(
          `INSERT INTO product_sqft_rates (product_id, thickness, mrp_per_sqft, updated_at)
           VALUES (?, ?, ?, ?)`,
        )
        .bind(productId, thickness, mrpPerSqft, ts),
    );
  }
  await db.batch(statements);
}
