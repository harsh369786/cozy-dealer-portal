-- Dealer assignment columns: sales_executive_user_id + nullable distributor_id

PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS dealers_new (
  id TEXT PRIMARY KEY,
  distributor_id TEXT REFERENCES distributors(id),
  sales_executive_user_id TEXT REFERENCES users(id),
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

INSERT INTO dealers_new (
  id, distributor_id, sales_executive_user_id, code, store_name, contact_name,
  location, address, phone, email, gst_number, active, deleted_at, created_at, updated_at
)
SELECT
  id, distributor_id, NULL, code, store_name, contact_name,
  location, address, phone, email, gst_number, active, deleted_at, created_at, updated_at
FROM dealers;

DROP TABLE dealers;
ALTER TABLE dealers_new RENAME TO dealers;

CREATE INDEX IF NOT EXISTS idx_dealers_distributor ON dealers(distributor_id);
CREATE INDEX IF NOT EXISTS idx_dealers_sales_executive ON dealers(sales_executive_user_id);

-- Backfill sales executive from dealer_assignments
UPDATE dealers
SET sales_executive_user_id = (
  SELECT da.assignee_user_id
  FROM dealer_assignments da
  WHERE da.dealer_id = dealers.id AND da.assignee_role = 'sales_executive'
  ORDER BY da.created_at DESC
  LIMIT 1
)
WHERE sales_executive_user_id IS NULL;

-- Dev/test unassigned samples
UPDATE dealers SET distributor_id = NULL WHERE id = 'dlr-menon';
UPDATE dealers SET sales_executive_user_id = NULL WHERE id = 'dlr-gupta';

PRAGMA foreign_keys = ON;
