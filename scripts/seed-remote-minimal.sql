-- Minimal remote seed for staging login tests (run after migrations)

INSERT OR IGNORE INTO distributors (id, name, region, phone)
VALUES ('dist-nagpur-01', 'Vikram Distributors', 'Nagpur', '+919823044120');

INSERT OR IGNORE INTO users (id, phone, name, role, dealer_id, distributor_id, status)
VALUES
  ('user-dist-vikram', '+919823044120', 'Vikram Distributors', 'distributor', NULL, 'dist-nagpur-01', 'active'),
  ('user-admin', '+919999999999', 'BackRest Admin', 'master_admin', NULL, NULL, 'active'),
  ('user-admin-staff', '+919888877777', 'Priya Operations', 'admin_staff', NULL, NULL, 'active'),
  ('user-sales-exec', '+919777766666', 'Amit Sales', 'sales_executive', NULL, NULL, 'active');

INSERT OR IGNORE INTO dealers (id, distributor_id, sales_executive_user_id, code, store_name, location, phone, active)
VALUES
  ('dlr-sharma', 'dist-nagpur-01', 'user-sales-exec', 'BR-NGP-014', 'Sharma Furnishings', 'Sitabuldi, Nagpur', '+919876543210', 1),
  ('dlr-patil', 'dist-nagpur-01', 'user-sales-exec', 'BR-NGP-022', 'Patil Mattress Gallery', 'Dharampeth, Nagpur', '+919762442108', 1),
  ('dlr-menon', NULL, NULL, 'BR-COK-005', 'Menon Bedding House', 'MG Road, Kochi', '+919847011223', 1),
  ('dlr-gupta', 'dist-nagpur-01', NULL, 'BR-IND-019', 'Gupta Mattress Mart', 'Vijay Nagar, Indore', '+919826077889', 1);

INSERT OR IGNORE INTO users (id, phone, name, role, dealer_id, distributor_id, status)
VALUES ('user-dealer-sharma', '+919876543210', 'Rajesh Sharma', 'dealer', 'dlr-sharma', NULL, 'active');
