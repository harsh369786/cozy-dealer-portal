CREATE TABLE IF NOT EXISTS order_sequences (
  date_prefix TEXT PRIMARY KEY,
  last_value INTEGER NOT NULL CHECK (last_value >= 0)
);

INSERT INTO order_sequences (date_prefix, last_value)
SELECT
  substr(id, 1, 9),
  MAX(CAST(substr(id, 10) AS INTEGER))
FROM orders
WHERE id GLOB 'BR-[0-9][0-9][0-9][0-9][0-9][0-9][0-9]*'
GROUP BY substr(id, 1, 9)
ON CONFLICT(date_prefix) DO UPDATE SET
  last_value = MAX(order_sequences.last_value, excluded.last_value);

CREATE UNIQUE INDEX IF NOT EXISTS idx_points_ledger_reward_reference
  ON points_ledger(reference_type, reference_id)
  WHERE reference_type IN ('reward_claim', 'reward_claim_undo')
    AND reference_id IS NOT NULL;
