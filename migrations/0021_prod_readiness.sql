CREATE UNIQUE INDEX IF NOT EXISTS idx_points_ledger_order_reference
  ON points_ledger(reference_type, reference_id)
  WHERE reference_type = 'order' AND reference_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_dealer_visits_one_active
  ON dealer_visits(sales_executive_user_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_orders_dealer_placed
  ON orders(dealer_id, placed_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_read
  ON notifications(recipient_user_id, read);
