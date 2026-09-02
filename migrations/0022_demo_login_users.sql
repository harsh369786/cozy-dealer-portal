-- Ensure demo / test login users exist (safe to re-run).
-- Insert order respects foreign keys:
--   distributors -> (users that reference only a distributor) -> dealers -> (users that reference a dealer)

-- 1. Distributor (no dependencies)
INSERT OR IGNORE INTO distributors (id, name, region, phone)
VALUES ('dist-nagpur-01', 'Vikram Distributors', 'Nagpur', '+919823044120');

-- 2. Users that do NOT depend on a dealer (admin, admin staff, distributor, sales exec).
--    The dealer row below references user-sales-exec, so this user must exist first.
INSERT INTO users (id, phone, name, role, dealer_id, distributor_id, status)
VALUES ('user-admin', '+919999999999', 'BackRest Admin', 'master_admin', NULL, NULL, 'active')
ON CONFLICT(phone) DO UPDATE SET
  role = excluded.role,
  name = excluded.name,
  status = 'active',
  deleted_at = NULL;

INSERT INTO users (id, phone, name, role, dealer_id, distributor_id, status)
VALUES ('user-admin-staff', '+919888877777', 'Priya Operations', 'admin_staff', NULL, NULL, 'active')
ON CONFLICT(phone) DO UPDATE SET
  role = excluded.role,
  name = excluded.name,
  distributor_id = excluded.distributor_id,
  status = 'active',
  deleted_at = NULL;

INSERT INTO users (id, phone, name, role, dealer_id, distributor_id, status)
VALUES ('user-dist-vikram', '+919823044120', 'Vikram Distributors', 'distributor', NULL, 'dist-nagpur-01', 'active')
ON CONFLICT(phone) DO UPDATE SET
  role = excluded.role,
  name = excluded.name,
  distributor_id = excluded.distributor_id,
  status = 'active',
  deleted_at = NULL;

INSERT INTO users (id, phone, name, role, dealer_id, distributor_id, status)
VALUES ('user-sales-exec', '+919777766666', 'Amit Sales', 'sales_executive', NULL, 'dist-nagpur-01', 'active')
ON CONFLICT(phone) DO UPDATE SET
  role = excluded.role,
  name = excluded.name,
  distributor_id = excluded.distributor_id,
  status = 'active',
  deleted_at = NULL;

-- 3. Dealer (references dist-nagpur-01 and user-sales-exec, both created above)
INSERT OR IGNORE INTO dealers (id, distributor_id, sales_executive_user_id, code, store_name, location, phone, active)
VALUES
  ('dlr-sharma', 'dist-nagpur-01', 'user-sales-exec', 'BR-NGP-014', 'Sharma Furnishings', 'Sitabuldi, Nagpur', '+919876543210', 1);

-- 4. Dealer user (references dlr-sharma, created above)
INSERT INTO users (id, phone, name, role, dealer_id, distributor_id, status)
VALUES ('user-dealer-sharma', '+919876543210', 'Rajesh Sharma', 'dealer', 'dlr-sharma', NULL, 'active')
ON CONFLICT(phone) DO UPDATE SET
  role = excluded.role,
  name = excluded.name,
  dealer_id = excluded.dealer_id,
  distributor_id = excluded.distributor_id,
  status = 'active',
  deleted_at = NULL;
