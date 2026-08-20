-- BackRest PWA — D1 initial schema

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS distributors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  region TEXT NOT NULL,
  phone TEXT NOT NULL,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dealers (
  id TEXT PRIMARY KEY,
  distributor_id TEXT NOT NULL REFERENCES distributors(id),
  code TEXT NOT NULL UNIQUE,
  store_name TEXT NOT NULL,
  contact_name TEXT,
  location TEXT NOT NULL,
  address TEXT,
  phone TEXT NOT NULL,
  email TEXT,
  gst_number TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL CHECK (role IN ('master_admin', 'admin_staff', 'distributor', 'sales_executive', 'dealer')),
  dealer_id TEXT REFERENCES dealers(id),
  distributor_id TEXT REFERENCES distributors(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dealer_assignments (
  id TEXT PRIMARY KEY,
  dealer_id TEXT NOT NULL REFERENCES dealers(id),
  assignee_user_id TEXT NOT NULL REFERENCES users(id),
  assignee_role TEXT NOT NULL CHECK (assignee_role IN ('distributor', 'sales_executive')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (dealer_id, assignee_user_id, assignee_role)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS otp_challenges (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS signup_applications (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  birthday TEXT NOT NULL,
  store_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  gst_number TEXT,
  distributor_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by TEXT REFERENCES users(id),
  created_dealer_id TEXT REFERENCES dealers(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  guarantee TEXT NOT NULL,
  fixed_size TEXT,
  blurb TEXT,
  image_r2_key TEXT,
  image_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS product_thicknesses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT NOT NULL REFERENCES products(id),
  thickness TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (product_id, thickness)
);

CREATE TABLE IF NOT EXISTS product_prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT NOT NULL REFERENCES products(id),
  mrp INTEGER NOT NULL,
  dealer_price INTEGER NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  free_items_label TEXT,
  effective_from TEXT NOT NULL DEFAULT (datetime('now')),
  effective_to TEXT
);

CREATE TABLE IF NOT EXISTS product_layers (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS product_layer_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  layer_id TEXT NOT NULL REFERENCES product_layers(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  subgroup_label TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS salespeople (
  id TEXT PRIMARY KEY,
  dealer_id TEXT NOT NULL REFERENCES dealers(id),
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  dealer_id TEXT NOT NULL REFERENCES dealers(id),
  distributor_id TEXT NOT NULL REFERENCES distributors(id),
  placed_by_user_id TEXT NOT NULL REFERENCES users(id),
  salesperson_id TEXT REFERENCES salespeople(id),
  status TEXT NOT NULL DEFAULT 'pending_approval',
  placed_at TEXT NOT NULL,
  approved_at TEXT,
  rejected_at TEXT,
  rejection_reason TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  customer_address TEXT,
  customer_email TEXT,
  total_items INTEGER NOT NULL DEFAULT 0,
  total_value INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  size_requested TEXT,
  size_standard TEXT,
  thickness TEXT,
  quantity INTEGER NOT NULL,
  perma INTEGER NOT NULL DEFAULT 0,
  perma_corners TEXT,
  perma_notes TEXT,
  mrp INTEGER NOT NULL,
  dealer_price INTEGER NOT NULL,
  campaign_id TEXT,
  campaign_price INTEGER,
  discount_percent REAL,
  free_items TEXT,
  points_earned INTEGER NOT NULL DEFAULT 0,
  line_total INTEGER NOT NULL,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS order_timeline_events (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  label TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  note TEXT,
  actor_user_id TEXT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS order_reminders (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  reminder_type TEXT NOT NULL DEFAULT 'pending_2h',
  sent_at TEXT NOT NULL,
  notification_id TEXT
);

CREATE TABLE IF NOT EXISTS price_campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  product_id TEXT NOT NULL REFERENCES products(id),
  discount_percent REAL NOT NULL,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  description TEXT,
  terms TEXT,
  badge_label TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sell_campaigns (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  emoji TEXT NOT NULL,
  goal_text TEXT NOT NULL,
  reward_text TEXT NOT NULL,
  target_count INTEGER NOT NULL,
  done_count INTEGER NOT NULL DEFAULT 0,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS distributor_campaigns (
  id TEXT PRIMARY KEY,
  distributor_id TEXT NOT NULL REFERENCES distributors(id),
  name TEXT NOT NULL,
  product_name TEXT NOT NULL,
  discount_label TEXT NOT NULL,
  description TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT NOT NULL,
  banner_emoji TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS campaign_dealer_eligibility (
  campaign_id TEXT NOT NULL,
  dealer_id TEXT NOT NULL,
  PRIMARY KEY (campaign_id, dealer_id)
);

CREATE TABLE IF NOT EXISTS reward_catalog (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL,
  points_required INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS reward_claims (
  id TEXT PRIMARY KEY,
  dealer_id TEXT NOT NULL REFERENCES dealers(id),
  reward_catalog_id TEXT REFERENCES reward_catalog(id),
  name TEXT NOT NULL,
  emoji TEXT NOT NULL,
  points_spent INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'delivered')),
  claimed_at TEXT NOT NULL,
  delivered_at TEXT
);

CREATE TABLE IF NOT EXISTS points_ledger (
  id TEXT PRIMARY KEY,
  dealer_id TEXT NOT NULL REFERENCES dealers(id),
  delta INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  label TEXT NOT NULL,
  reference_type TEXT,
  reference_id TEXT,
  occurred_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS complaints (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  dealer_id TEXT NOT NULL REFERENCES dealers(id),
  distributor_id TEXT NOT NULL REFERENCES distributors(id),
  category TEXT DEFAULT 'general',
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  step INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  recipient_user_id TEXT NOT NULL REFERENCES users(id),
  category TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  is_reminder INTEGER NOT NULL DEFAULT 0,
  metadata TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS whatsapp_outbox (
  id TEXT PRIMARY KEY,
  to_phone TEXT NOT NULL,
  template_key TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  provider_message_id TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  scheduled_at TEXT NOT NULL,
  sent_at TEXT
);

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  before_json TEXT,
  after_json TEXT,
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_dealer ON users(dealer_id);
CREATE INDEX IF NOT EXISTS idx_dealers_distributor ON dealers(distributor_id);
CREATE INDEX IF NOT EXISTS idx_orders_dealer ON orders(dealer_id);
CREATE INDEX IF NOT EXISTS idx_orders_distributor ON orders(distributor_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_placed_at ON orders(placed_at);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_user_id);
CREATE INDEX IF NOT EXISTS idx_complaints_dealer ON complaints(dealer_id);
