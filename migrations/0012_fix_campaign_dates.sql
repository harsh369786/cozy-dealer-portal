-- Backfill campaigns missing start/end dates (legacy sell/distributor rows)
UPDATE price_campaigns
SET start_at = date('now')
WHERE start_at IS NULL OR trim(start_at) = '';

UPDATE price_campaigns
SET end_at = date('now', '+1 year')
WHERE end_at IS NULL OR trim(end_at) = '';
