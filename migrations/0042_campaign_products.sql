-- Multi-product campaigns: a campaign may target MANY products. Previously a campaign had a single
-- price_campaigns.product_id (NULL = all products). This ADD-only join table records the full set of
-- targeted products WITHOUT touching the existing column: price_campaigns.product_id keeps holding
-- the FIRST selected product (or NULL for all-products) so every existing single-product query
-- (pricing matcher, catalog badge CTE, public lists, admin list) keeps working unchanged. Pricing +
-- catalog reads additionally consult this table so all targeted products get the campaign.
--
-- ADD-only (new table + index) — safe on populated D1, no rebuild of price_campaigns/products.
CREATE TABLE IF NOT EXISTS price_campaign_products (
  campaign_id TEXT NOT NULL REFERENCES price_campaigns(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  PRIMARY KEY (campaign_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_price_campaign_products_product ON price_campaign_products(product_id);
CREATE INDEX IF NOT EXISTS idx_price_campaign_products_campaign ON price_campaign_products(campaign_id);
