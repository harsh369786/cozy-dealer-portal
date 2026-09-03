-- Reward-point reversal for cancelled orders that had already been delivered.
-- A single reversal ledger entry per order guarantees idempotent reversal.
CREATE UNIQUE INDEX IF NOT EXISTS idx_points_ledger_order_reversal_reference
  ON points_ledger(reference_type, reference_id)
  WHERE reference_type = 'order_reward_reversal' AND reference_id IS NOT NULL;
