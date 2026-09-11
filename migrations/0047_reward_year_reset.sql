-- Master Admin Reward Points Management: manual credits + annual reward-year reset.
--
-- No changes to points_ledger structure — it already carries everything we need
-- (delta, balance_after, label, reference_type, reference_id, occurred_at). Manual
-- master-admin credits are recorded as points_ledger rows with reference_type='manual_credit'
-- (and a reversal uses reference_type='manual_reversal'); the annual reset writes one
-- negative points_ledger row per dealer with reference_type='reward_reset'. That keeps every
-- balance change auditable through the same immutable ledger (never edited/deleted in place —
-- corrections are new reversal rows).
--
-- This migration only ADDS a table to record each annual reset event. ADD-only — safe on
-- populated prod D1 (never rebuilds an FK-referenced table).

CREATE TABLE IF NOT EXISTS reward_year_resets (
  id TEXT PRIMARY KEY,
  reward_year INTEGER NOT NULL,        -- the reward year that was closed out (e.g. 2026)
  reference_id TEXT NOT NULL,          -- unique reset reference (also stamped on each ledger row)
  actor_user_id TEXT REFERENCES users(id),
  dealers_affected INTEGER NOT NULL DEFAULT 0,
  points_cleared INTEGER NOT NULL DEFAULT 0,
  reset_at TEXT NOT NULL
);

-- Prevent accidental duplicate resets for the same reward year.
CREATE UNIQUE INDEX IF NOT EXISTS idx_reward_year_resets_year ON reward_year_resets(reward_year);

-- Helps the manual-credit idempotency lookup (dealer + reference) and history reads.
CREATE INDEX IF NOT EXISTS idx_points_ledger_reference ON points_ledger(reference_type, reference_id);
