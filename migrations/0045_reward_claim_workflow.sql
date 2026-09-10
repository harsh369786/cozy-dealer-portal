-- Reward Claim multi-stage workflow (SEPARATE from Orders).
--
-- Target statuses: claimed -> pending_approval -> approved -> processing ->
--                   dispatched_from_factory -> delivered  (+ rejected, cancelled)
--
-- The legacy reward_claims.status column has a CHECK constraint (pending|approved|delivered) and
-- CANNOT be altered on a populated D1 prod DB (a table rebuild fails on the FK-referenced parent —
-- confirmed the hard way before). So we DO NOT touch that CHECK. Instead we add a NEW free-text
-- `workflow_status` column that carries the full 8-state workflow, plus stage timestamps, the actor
-- who performed each stage, the rejection reason, and the distributor (derived from the dealer at
-- claim time). The legacy `status` column is kept loosely in sync (pending/approved/delivered) by
-- the app for backward compatibility with older reads. ADD-only — safe on populated prod.

ALTER TABLE reward_claims ADD COLUMN workflow_status TEXT;
ALTER TABLE reward_claims ADD COLUMN distributor_id TEXT;
ALTER TABLE reward_claims ADD COLUMN rejection_reason TEXT;
ALTER TABLE reward_claims ADD COLUMN processing_at TEXT;
ALTER TABLE reward_claims ADD COLUMN dispatched_at TEXT;
ALTER TABLE reward_claims ADD COLUMN cancelled_at TEXT;
ALTER TABLE reward_claims ADD COLUMN rejected_at TEXT;
ALTER TABLE reward_claims ADD COLUMN approved_by TEXT;
ALTER TABLE reward_claims ADD COLUMN processed_by TEXT;
ALTER TABLE reward_claims ADD COLUMN dispatched_by TEXT;
ALTER TABLE reward_claims ADD COLUMN delivered_by TEXT;
ALTER TABLE reward_claims ADD COLUMN rejected_by TEXT;

-- Backfill the new workflow_status from the legacy status for existing claims:
--   pending   -> pending_approval (awaiting distributor approval)
--   approved  -> approved
--   delivered -> delivered
UPDATE reward_claims
SET workflow_status = CASE
  WHEN status = 'delivered' THEN 'delivered'
  WHEN status = 'approved' THEN 'approved'
  ELSE 'pending_approval'
END
WHERE workflow_status IS NULL;

-- Derive the distributor from the dealer for existing claims (claims never stored one before).
UPDATE reward_claims
SET distributor_id = (
  SELECT d.distributor_id FROM dealers d WHERE d.id = reward_claims.dealer_id
)
WHERE distributor_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_reward_claims_workflow_status ON reward_claims(workflow_status);
CREATE INDEX IF NOT EXISTS idx_reward_claims_distributor ON reward_claims(distributor_id);
