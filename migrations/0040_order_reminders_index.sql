-- Speeds up the order-reminder scan/dedupe lookups which filter by (order_id, reminder_type).
-- ADD-only, idempotent.
CREATE INDEX IF NOT EXISTS idx_order_reminders_order_type
  ON order_reminders(order_id, reminder_type);
