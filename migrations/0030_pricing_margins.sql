-- Margin-based pricing model.
--
-- Product master keeps a single fixed MRP per product (product_prices.mrp is the
-- absolute MRP for the base 72"x36" size; MRP-per-sqft = mrp / 18). Each price list
-- (pricing tier) now holds, PER PRODUCT, a Dealer Margin % and a Distributor Margin %.
--   Dealer Price     = MRP x (1 - dealerMargin%/100)
--   Distributor Price = Dealer Price / (1 + distributorMargin%/100)
--
-- SQLite: ALTER TABLE ... ADD COLUMN cannot use non-constant defaults, so we add the
-- columns with a constant default and backfill separately.

-- 1) Per-product-per-tier margins.
ALTER TABLE pricing_tier_product_prices ADD COLUMN dealer_margin_percent REAL;
ALTER TABLE pricing_tier_product_prices ADD COLUMN distributor_margin_percent REAL;

-- 2) Backfill dealer margin from the existing absolute dealer_price vs the product MRP.
--    dealer_margin% = (1 - dealer_price / mrp) * 100, clamped to [0, 100].
--    Uses the latest product_prices row per product for MRP.
UPDATE pricing_tier_product_prices
SET dealer_margin_percent = (
  SELECT CASE
    WHEN latest.mrp IS NULL OR latest.mrp <= 0 THEN 0
    ELSE MAX(0, MIN(100, (1.0 - (CAST(pricing_tier_product_prices.dealer_price AS REAL) / latest.mrp)) * 100.0))
  END
  FROM (
    SELECT pp.product_id AS pid, pp.mrp AS mrp
    FROM product_prices pp
    INNER JOIN (
      SELECT product_id, MAX(id) AS id FROM product_prices GROUP BY product_id
    ) l ON l.id = pp.id
  ) latest
  WHERE latest.pid = pricing_tier_product_prices.product_id
)
WHERE dealer_margin_percent IS NULL;

-- 3) Backfill each product's distributor margin from its tier's single margin
--    (before this change, distributor margin lived only on pricing_tiers).
UPDATE pricing_tier_product_prices
SET distributor_margin_percent = (
  SELECT COALESCE(t.distributor_margin_percent, 20)
  FROM pricing_tiers t
  WHERE t.id = pricing_tier_product_prices.tier_id
)
WHERE distributor_margin_percent IS NULL;

-- 4) Any rows still null (missing MRP etc.) get safe defaults.
UPDATE pricing_tier_product_prices SET dealer_margin_percent = 0 WHERE dealer_margin_percent IS NULL;
UPDATE pricing_tier_product_prices SET distributor_margin_percent = 20 WHERE distributor_margin_percent IS NULL;

-- 5) Snapshot dealer margin on order lines (distributor_price / distributor_margin_percent
--    already added in 0028). Historical rows get a derived dealer margin from mrp vs dealer_price.
ALTER TABLE order_items ADD COLUMN dealer_margin_percent REAL;

UPDATE order_items
SET dealer_margin_percent = CASE
  WHEN mrp IS NULL OR mrp <= 0 THEN 0
  ELSE MAX(0, MIN(100, (1.0 - (CAST(dealer_price AS REAL) / mrp)) * 100.0))
END
WHERE dealer_margin_percent IS NULL;
