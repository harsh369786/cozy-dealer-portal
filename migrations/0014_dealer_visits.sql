-- Sales Executive dealer visit check-in / check-out

CREATE TABLE IF NOT EXISTS dealer_visits (
  id TEXT PRIMARY KEY,
  sales_executive_user_id TEXT NOT NULL REFERENCES users(id),
  dealer_name TEXT NOT NULL,
  store_name TEXT NOT NULL,
  address TEXT NOT NULL,
  mobile TEXT NOT NULL,
  dealer_id TEXT REFERENCES dealers(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  check_in_at TEXT NOT NULL,
  check_out_at TEXT,
  check_in_lat REAL,
  check_in_lng REAL,
  check_out_lat REAL,
  check_out_lng REAL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_dealer_visits_se ON dealer_visits(sales_executive_user_id);
CREATE INDEX IF NOT EXISTS idx_dealer_visits_status ON dealer_visits(status);
CREATE INDEX IF NOT EXISTS idx_dealer_visits_check_in ON dealer_visits(check_in_at);
