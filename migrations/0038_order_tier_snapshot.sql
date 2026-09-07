-- Tier-wise analytics: snapshot the DEALER and DISTRIBUTOR pricing tier onto each order line at
-- the time of sale, so reports stay historically accurate when a dealer/distributor is later moved
-- to a different tier (e.g. promoted for good performance). Without this, grouping orders by the
-- account's CURRENT pricing_tier_id would retroactively re-bucket past sales.
--
-- ADD-only (two ALTER ADD COLUMN + a backfill UPDATE + indexes) — safe on populated D1, no rebuild.
ALTER TABLE order_items ADD COLUMN dealer_tier_id TEXT;
ALTER TABLE order_items ADD COLUMN distributor_tier_id TEXT;

-- Backfill existing lines from the account's CURRENT tier. Best-effort: we have no record of the
-- tier at the original sale time for historical rows, so today's tier is the best available value.
-- New orders (see createOrder) capture the exact tier going forward.
UPDATE order_items
SET dealer_tier_id = COALESCE(
  (SELECT d.pricing_tier_id
   FROM orders o JOIN dealers d ON d.id = o.dealer_id
   WHERE o.id = order_items.order_id),
  'tier-t1'
)
WHERE dealer_tier_id IS NULL;

UPDATE order_items
SET distributor_tier_id = COALESCE(
  (SELECT dist.pricing_tier_id
   FROM orders o JOIN distributors dist ON dist.id = o.distributor_id
   WHERE o.id = order_items.order_id),
  'tier-t1'
)
WHERE distributor_tier_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_order_items_dealer_tier ON order_items(dealer_tier_id);
CREATE INDEX IF NOT EXISTS idx_order_items_distributor_tier ON order_items(distributor_tier_id);
