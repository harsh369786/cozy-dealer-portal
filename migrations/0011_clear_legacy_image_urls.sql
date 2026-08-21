-- Clear broken R2 proxy URLs after R2 removal (images must be re-uploaded as data URLs)
UPDATE price_campaigns SET image_url = NULL, image_r2_key = NULL WHERE image_url LIKE '/api/v1/%';
UPDATE reward_catalog SET image_url = NULL, image_r2_key = NULL WHERE image_url LIKE '/api/v1/%';
