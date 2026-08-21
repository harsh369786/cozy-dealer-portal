-- Signup approval user statuses + signup_applications.user_id

PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS users_new (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL CHECK (role IN ('master_admin', 'admin_staff', 'distributor', 'sales_executive', 'dealer')),
  dealer_id TEXT REFERENCES dealers(id),
  distributor_id TEXT REFERENCES distributors(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending_approval', 'active', 'suspended', 'rejected')),
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO users_new (
  id, phone, name, email, role, dealer_id, distributor_id, status, deleted_at, created_at, updated_at
)
SELECT
  id, phone, name, email, role, dealer_id, distributor_id, status, deleted_at, created_at, updated_at
FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

ALTER TABLE signup_applications ADD COLUMN user_id TEXT REFERENCES users(id);
ALTER TABLE signup_applications ADD COLUMN review_note TEXT;

CREATE INDEX IF NOT EXISTS idx_signup_applications_status_created ON signup_applications(status, created_at);

PRAGMA foreign_keys = ON;
