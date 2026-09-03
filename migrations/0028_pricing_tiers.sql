-- Pricing tiers: dealer price per product per tier; distributor price is derived.
-- SQLite cannot ADD COLUMN with REFERENCES + non-NULL DEFAULT in one statement.

CREATE TABLE IF NOT EXISTS pricing_tiers (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  distributor_margin_percent REAL NOT NULL DEFAULT 20,
  sort_order INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pricing_tier_product_prices (
  tier_id TEXT NOT NULL REFERENCES pricing_tiers(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  dealer_price INTEGER NOT NULL,
  PRIMARY KEY (tier_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_tier_prices_product ON pricing_tier_product_prices(product_id);

INSERT OR IGNORE INTO pricing_tiers (id, code, name, distributor_margin_percent, sort_order)
VALUES ('tier-t1', 'T1', 'Tier 1', 20, 1);

INSERT OR IGNORE INTO pricing_tier_product_prices (tier_id, product_id, dealer_price)
SELECT 'tier-t1', pp.product_id, pp.dealer_price
FROM product_prices pp
INNER JOIN (
  SELECT product_id, MAX(id) AS id
  FROM product_prices
  GROUP BY product_id
) latest ON latest.id = pp.id;

ALTER TABLE dealers ADD COLUMN pricing_tier_id TEXT;
ALTER TABLE distributors ADD COLUMN pricing_tier_id TEXT;

UPDATE dealers SET pricing_tier_id = 'tier-t1' WHERE pricing_tier_id IS NULL;
UPDATE distributors SET pricing_tier_id = 'tier-t1' WHERE pricing_tier_id IS NULL;

ALTER TABLE order_items ADD COLUMN distributor_price INTEGER;
ALTER TABLE order_items ADD COLUMN distributor_margin_percent REAL;

UPDATE order_items
SET
  distributor_margin_percent = COALESCE(distributor_margin_percent, 20),
  distributor_price = COALESCE(
    distributor_price,
    CAST(ROUND(dealer_price / 1.20) AS INTEGER)
  )
WHERE distributor_price IS NULL;
