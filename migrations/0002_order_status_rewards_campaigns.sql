-- Order status workflow, reward %, campaign WhatsApp targeting

-- Product reward configuration
ALTER TABLE product_prices ADD COLUMN reward_percent REAL NOT NULL DEFAULT 0;
ALTER TABLE product_prices ADD COLUMN reward_eligibility TEXT NOT NULL DEFAULT 'dealer'
  CHECK (reward_eligibility IN ('dealer', 'distributor', 'both'));

-- Campaign WhatsApp targeting (in-app always goes to relevant audience)
ALTER TABLE price_campaigns ADD COLUMN whatsapp_target_dealers INTEGER NOT NULL DEFAULT 1;
ALTER TABLE price_campaigns ADD COLUMN whatsapp_target_distributors INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sell_campaigns ADD COLUMN whatsapp_target_dealers INTEGER NOT NULL DEFAULT 1;
ALTER TABLE sell_campaigns ADD COLUMN whatsapp_target_distributors INTEGER NOT NULL DEFAULT 0;
ALTER TABLE distributor_campaigns ADD COLUMN whatsapp_target_dealers INTEGER NOT NULL DEFAULT 1;
ALTER TABLE distributor_campaigns ADD COLUMN whatsapp_target_distributors INTEGER NOT NULL DEFAULT 0;

-- Timeline status key for audit
ALTER TABLE order_timeline_events ADD COLUMN status_key TEXT;

-- Track reward credit on delivery
ALTER TABLE orders ADD COLUMN delivered_at TEXT;
ALTER TABLE orders ADD COLUMN rewards_credited_at TEXT;
