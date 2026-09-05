-- Demo login user for the view-only sales_head role, so it can be tested via a demo button.
--
-- sales_head is NOT a users.role CHECK value; it's stored as a base role 'admin_staff' plus a row
-- in user_role_overrides (migration 0034), resolved to the effective role at session time. So this
-- seeds an admin_staff user and an override row pointing it at 'sales_head'.
--
-- Depends on user_role_overrides existing (0034). Safe to re-run. admin_staff demo user
-- (user-admin-staff, +919888877777) already exists from 0022 and needs no override.

-- 1. Base user (CHECK-legal role 'admin_staff').
INSERT INTO users (id, phone, name, role, dealer_id, distributor_id, status)
VALUES ('user-sales-head', '+919866655555', 'Sunita Sales Head', 'admin_staff', NULL, NULL, 'active')
ON CONFLICT(phone) DO UPDATE SET
  role = 'admin_staff',
  name = excluded.name,
  status = 'active',
  deleted_at = NULL;

-- 2. Override row upgrading the effective role to sales_head.
INSERT INTO user_role_overrides (user_id, role)
VALUES ('user-sales-head', 'sales_head')
ON CONFLICT(user_id) DO UPDATE SET
  role = 'sales_head',
  updated_at = datetime('now');
