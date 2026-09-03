import { nowIso } from "../utils";
import {
  BASE_MATTRESS_BREADTH,
  BASE_MATTRESS_LENGTH,
} from "./mattress-pricing";

export type SqftRateRow = {
  guarantee: string;
  thickness: string;
  mrpPerSqft: number;
  dealerPerSqft: number;
  rewardPercent: number;
  effectiveFrom: string;
};

function mapRateRow(row: Record<string, unknown>): SqftRateRow {
  return {
    guarantee: String(row.guarantee),
    thickness: String(row.thickness),
    mrpPerSqft: Number(row.mrp_per_sqft),
    dealerPerSqft: Number(row.dealer_per_sqft),
    rewardPercent: Number(row.reward_percent ?? 0),
    effectiveFrom: String(row.effective_from),
  };
}

function baseSqftArea() {
  return (BASE_MATTRESS_LENGTH * BASE_MATTRESS_BREADTH) / 144;
}

function pricesFromRate(rate: SqftRateRow) {
  const areaSqft = baseSqftArea();
  const mrp = Math.round(rate.mrpPerSqft * areaSqft);
  const dealerPrice = Math.round(rate.dealerPerSqft * areaSqft);
  const points = Math.round((mrp * rate.rewardPercent) / 100);
  return { mrp, dealerPrice, points, rewardPercent: rate.rewardPercent };
}

export async function listSqftRates(db: D1Database) {
  const { results } = await db
    .prepare(
      `SELECT guarantee, thickness, mrp_per_sqft, dealer_per_sqft, reward_percent, effective_from
       FROM mattress_sqft_rates ORDER BY guarantee, thickness`,
    )
    .all<Record<string, unknown>>();
  return results.map(mapRateRow);
}

export async function upsertSqftRate(db: D1Database, input: SqftRateRow) {
  if (!input.guarantee.trim() || !input.thickness.trim()) {
    throw new Error("Guarantee and thickness are required");
  }
  if (input.mrpPerSqft <= 0 || input.dealerPerSqft <= 0) {
    throw new Error("MRP and dealer per sqft must be positive");
  }
  const effectiveFrom = input.effectiveFrom?.trim() || nowIso().slice(0, 10);
  await db
    .prepare(
      `INSERT INTO mattress_sqft_rates (guarantee, thickness, mrp_per_sqft, dealer_per_sqft, reward_percent, effective_from)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(guarantee, thickness) DO UPDATE SET
         mrp_per_sqft = excluded.mrp_per_sqft,
         dealer_per_sqft = excluded.dealer_per_sqft,
         reward_percent = excluded.reward_percent,
         effective_from = excluded.effective_from`,
    )
    .bind(
      input.guarantee.trim(),
      input.thickness.trim(),
      input.mrpPerSqft,
      input.dealerPerSqft,
      input.rewardPercent ?? 0,
      effectiveFrom,
    )
    .run();
  return mapRateRow({
    guarantee: input.guarantee,
    thickness: input.thickness,
    mrp_per_sqft: input.mrpPerSqft,
    dealer_per_sqft: input.dealerPerSqft,
    reward_percent: input.rewardPercent,
    effective_from: effectiveFrom,
  });
}

export async function deleteSqftRate(db: D1Database, guarantee: string, thickness: string) {
  await db
    .prepare(`DELETE FROM mattress_sqft_rates WHERE guarantee = ? AND thickness = ?`)
    .bind(guarantee, thickness)
    .run();
}

export async function recalculateProductPrices(db: D1Database) {
  const rates = await listSqftRates(db);
  let updated = 0;
  const statements: D1PreparedStatement[] = [];

  for (const rate of rates) {
    const { results: products } = await db
      .prepare(
        `SELECT DISTINCT p.id
         FROM products p
         JOIN product_thicknesses pt ON pt.product_id = p.id AND pt.thickness = ?
         WHERE p.guarantee = ? AND p.deleted_at IS NULL`,
      )
      .bind(rate.thickness, rate.guarantee)
      .all<{ id: string }>();
    if (!products.length) continue;

    const { mrp, dealerPrice, points, rewardPercent } = pricesFromRate(rate);
    const ids = products.map((p) => p.id);
    const placeholders = ids.map(() => "?").join(",");
    const { results: priceRows } = await db
      .prepare(
        `SELECT pp.product_id, pp.id
         FROM product_prices pp
         WHERE pp.product_id IN (${placeholders})
           AND pp.id = (
             SELECT p2.id FROM product_prices p2
             WHERE p2.product_id = pp.product_id
             ORDER BY p2.effective_from DESC LIMIT 1
           )`,
      )
      .bind(...ids)
      .all<{ product_id: string; id: number }>();
    const priceIdByProduct = new Map(priceRows.map((r) => [r.product_id, r.id]));

    for (const product of products) {
      const priceId = priceIdByProduct.get(product.id);
      if (priceId) {
        statements.push(
          db
            .prepare(
              `UPDATE product_prices SET mrp = ?, dealer_price = ?, points = ?, reward_percent = ? WHERE id = ?`,
            )
            .bind(mrp, dealerPrice, points, rewardPercent, priceId),
        );
      } else {
        statements.push(
          db
            .prepare(
              `INSERT INTO product_prices (product_id, mrp, dealer_price, points, reward_percent, reward_eligibility, free_items_label)
               VALUES (?, ?, ?, ?, ?, 'dealer', NULL)`,
            )
            .bind(product.id, mrp, dealerPrice, points, rewardPercent),
        );
      }
      updated += 1;
    }
  }

  for (let i = 0; i < statements.length; i += 40) {
    await db.batch(statements.slice(i, i + 40));
  }

  return { updated, rateCount: rates.length };
}

/**
 * Distinct guarantee + thickness values already present in the catalog, so the
 * admin sq.ft rate form can offer dropdowns instead of free-text (which caused
 * mismatches like "10 Years" vs "10 Year").
 */
export async function listCatalogRateOptions(db: D1Database) {
  const guaranteeRows = await db
    .prepare(
      `SELECT DISTINCT TRIM(guarantee) AS value
       FROM products
       WHERE deleted_at IS NULL AND guarantee IS NOT NULL AND TRIM(guarantee) != ''
       ORDER BY value`,
    )
    .all<{ value: string }>();

  const thicknessRows = await db
    .prepare(
      `SELECT DISTINCT TRIM(thickness) AS value
       FROM product_thicknesses
       WHERE thickness IS NOT NULL AND TRIM(thickness) != ''
       ORDER BY value`,
    )
    .all<{ value: string }>();

  return {
    guarantees: guaranteeRows.results.map((r) => r.value),
    thicknesses: thicknessRows.results.map((r) => r.value),
  };
}
