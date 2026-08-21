-- Reward catalogue images (same R2 bucket as campaigns, rewards/ prefix)
ALTER TABLE reward_catalog ADD COLUMN image_r2_key TEXT;
ALTER TABLE reward_catalog ADD COLUMN image_url TEXT;

-- Complaints referenced orders that were never seeded; point at real demo orders
UPDATE complaints SET order_id = 'BR-10245' WHERE id = 'CMP-10245';
UPDATE complaints SET order_id = 'BR-10243' WHERE id = 'CMP-10238';
UPDATE complaints SET order_id = 'BR-10242' WHERE id = 'CMP-10231';
