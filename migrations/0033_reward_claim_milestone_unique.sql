-- Prevent a dealer from claiming more than one MILESTONE reward. The "milestone" attribute lives
-- on reward_catalog.kind, which a UNIQUE index on reward_claims cannot reference across a join, so
-- we snapshot the kind onto the claim row and enforce uniqueness with a partial index.
-- ADD-only (ALTER ADD COLUMN + CREATE INDEX) — safe on populated D1, no table rebuild.

ALTER TABLE reward_claims ADD COLUMN kind TEXT;

-- Backfill existing claims from the catalog so the partial index reflects historical milestone claims.
UPDATE reward_claims
SET kind = COALESCE(
  (SELECT cat.kind FROM reward_catalog cat WHERE cat.id = reward_claims.reward_catalog_id),
  'standard'
)
WHERE kind IS NULL;

-- One milestone claim per dealer. Partial index so standard claims are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS idx_reward_claims_one_milestone_per_dealer
  ON reward_claims(dealer_id)
  WHERE kind = 'milestone';
