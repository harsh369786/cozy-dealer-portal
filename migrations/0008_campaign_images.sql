-- Campaign images (R2) and product linkage for distributor campaigns

ALTER TABLE price_campaigns ADD COLUMN image_r2_key TEXT;
ALTER TABLE price_campaigns ADD COLUMN image_url TEXT;

ALTER TABLE sell_campaigns ADD COLUMN image_r2_key TEXT;
ALTER TABLE sell_campaigns ADD COLUMN image_url TEXT;

ALTER TABLE distributor_campaigns ADD COLUMN product_id TEXT REFERENCES products(id);
ALTER TABLE distributor_campaigns ADD COLUMN image_r2_key TEXT;
ALTER TABLE distributor_campaigns ADD COLUMN image_url TEXT;
