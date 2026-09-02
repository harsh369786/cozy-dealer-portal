let thicknessPriceColumns: boolean | undefined;

/** True after migration 0023 (product_thicknesses.mrp / dealer_price). */
export async function hasProductThicknessPriceColumns(db: D1Database): Promise<boolean> {
  if (thicknessPriceColumns !== undefined) return thicknessPriceColumns;
  const row = await db
    .prepare(
      `SELECT 1 AS ok FROM pragma_table_info('product_thicknesses') WHERE name = 'mrp' LIMIT 1`,
    )
    .first<{ ok: number }>();
  thicknessPriceColumns = Boolean(row);
  return thicknessPriceColumns;
}
