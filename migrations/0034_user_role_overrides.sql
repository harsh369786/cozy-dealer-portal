-- View-only "sales_head" role, stored WITHOUT touching the users.role CHECK constraint.
--
-- Changing the users.role CHECK to allow 'sales_head' would require rebuilding the users table,
-- which D1 refuses on the populated production DB (it is referenced by FKs from ~11 tables and
-- D1 ignores PRAGMA foreign_keys=OFF / defer_foreign_keys). That attempt previously reset the prod
-- DB. So instead we keep users.role at a CHECK-legal base value (e.g. 'admin_staff') and store the
-- effective role here. Session resolution reads this table and upgrades the effective role.
--
-- ADD-only (new table) — no users rebuild, no downtime, instant on D1. Forward-compatible: if a
-- real users.role='sales_head' is ever introduced via a maintenance window, this table can be
-- migrated from and dropped.
CREATE TABLE IF NOT EXISTS user_role_overrides (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  role TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
