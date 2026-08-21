-- Unify price, sell, and distributor campaigns into price_campaigns

CREATE TABLE price_campaigns_unified (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  product_id TEXT REFERENCES products(id),
  discount_percent REAL NOT NULL DEFAULT 0,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  description TEXT,
  terms TEXT,
  badge_label TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  whatsapp_target_dealers INTEGER NOT NULL DEFAULT 1,
  whatsapp_target_distributors INTEGER NOT NULL DEFAULT 0,
  image_r2_key TEXT,
  image_url TEXT,
  target_count INTEGER,
  done_count INTEGER NOT NULL DEFAULT 0,
  distributor_id TEXT REFERENCES distributors(id)
);

INSERT INTO price_campaigns_unified (
  id, name, product_id, discount_percent, start_at, end_at, description, terms, badge_label,
  status, deleted_at, created_at, whatsapp_target_dealers, whatsapp_target_distributors,
  image_r2_key, image_url, target_count, done_count, distributor_id
)
SELECT
  id, name, product_id, discount_percent, start_at, end_at, description, terms, badge_label,
  status, deleted_at, created_at, whatsapp_target_dealers, whatsapp_target_distributors,
  image_r2_key, image_url, NULL, 0, NULL
FROM price_campaigns;

INSERT OR IGNORE INTO price_campaigns_unified (
  id, name, product_id, discount_percent, start_at, end_at, description, badge_label,
  status, deleted_at, whatsapp_target_dealers, whatsapp_target_distributors,
  image_r2_key, image_url, target_count, done_count
)
SELECT
  sc.id,
  sc.title,
  NULL,
  0,
  sc.starts_at,
  sc.ends_at,
  sc.goal_text || CASE
    WHEN length(trim(sc.reward_text)) > 0 THEN char(10) || char(10) || 'Reward: ' || sc.reward_text
    ELSE ''
  END,
  CASE WHEN length(trim(sc.reward_text)) > 0 THEN sc.reward_text ELSE sc.emoji END,
  sc.status,
  sc.deleted_at,
  sc.whatsapp_target_dealers,
  sc.whatsapp_target_distributors,
  sc.image_r2_key,
  sc.image_url,
  sc.target_count,
  sc.done_count
FROM sell_campaigns sc;

INSERT OR IGNORE INTO price_campaigns_unified (
  id, name, product_id, discount_percent, start_at, end_at, description, badge_label,
  status, deleted_at, whatsapp_target_dealers, whatsapp_target_distributors,
  image_r2_key, image_url, distributor_id
)
SELECT
  dc.id,
  dc.name,
  dc.product_id,
  0,
  dc.start_date,
  dc.end_date,
  dc.description,
  dc.discount_label,
  dc.status,
  dc.deleted_at,
  dc.whatsapp_target_dealers,
  dc.whatsapp_target_distributors,
  dc.image_r2_key,
  dc.image_url,
  dc.distributor_id
FROM distributor_campaigns dc;

DROP TABLE price_campaigns;
ALTER TABLE price_campaigns_unified RENAME TO price_campaigns;

CREATE INDEX IF NOT EXISTS idx_price_campaigns_product ON price_campaigns(product_id);
CREATE INDEX IF NOT EXISTS idx_price_campaigns_distributor ON price_campaigns(distributor_id);
