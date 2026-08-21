CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_challenges(phone);
CREATE INDEX IF NOT EXISTS idx_otp_verified ON otp_challenges(verified_at);
CREATE INDEX IF NOT EXISTS idx_points_ledger_dealer ON points_ledger(dealer_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_reward_claims_dealer ON reward_claims(dealer_id);
CREATE INDEX IF NOT EXISTS idx_order_timeline_order ON order_timeline_events(order_id);
CREATE INDEX IF NOT EXISTS idx_dealers_se ON dealers(sales_executive_user_id);
CREATE INDEX IF NOT EXISTS idx_complaints_order ON complaints(order_id);
