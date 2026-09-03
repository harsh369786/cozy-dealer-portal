-- Reward claim workflow: Pending -> Approved -> Delivered.
-- The original reward_claims.status CHECK only allowed ('pending','delivered'); SQLite cannot
-- alter a CHECK constraint in place, so rebuild the table with the expanded set and an approved_at.

PRAGMA foreign_keys = OFF;

CREATE TABLE reward_claims_new (
  id TEXT PRIMARY KEY,
  dealer_id TEXT NOT NULL REFERENCES dealers(id),
  reward_catalog_id TEXT REFERENCES reward_catalog(id),
  name TEXT NOT NULL,
  emoji TEXT NOT NULL,
  points_spent INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'delivered')),
  claimed_at TEXT NOT NULL,
  approved_at TEXT,
  delivered_at TEXT
);

INSERT INTO reward_claims_new (id, dealer_id, reward_catalog_id, name, emoji, points_spent, status, claimed_at, approved_at, delivered_at)
SELECT id, dealer_id, reward_catalog_id, name, emoji, points_spent, status, claimed_at, NULL, delivered_at
FROM reward_claims;

DROP TABLE reward_claims;
ALTER TABLE reward_claims_new RENAME TO reward_claims;

CREATE INDEX IF NOT EXISTS idx_reward_claims_dealer ON reward_claims(dealer_id);
CREATE INDEX IF NOT EXISTS idx_reward_claims_status ON reward_claims(status);

PRAGMA foreign_keys = ON;
