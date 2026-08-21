-- Wipe demo seed data from remote D1 (safe order, FK checks off)
PRAGMA foreign_keys = OFF;

DELETE FROM order_timeline_events;
DELETE FROM order_items;
DELETE FROM order_reminders;
DELETE FROM orders;
DELETE FROM complaints;
DELETE FROM reward_claims;
DELETE FROM points_ledger;
DELETE FROM campaign_dealer_eligibility;
DELETE FROM dealer_assignments;
DELETE FROM notifications;
DELETE FROM whatsapp_outbox;
DELETE FROM audit_logs;
DELETE FROM sessions;
DELETE FROM otp_challenges;
DELETE FROM salespeople;
DELETE FROM product_layer_items;
DELETE FROM product_thicknesses;
DELETE FROM product_prices;
DELETE FROM price_campaigns;
DELETE FROM sell_campaigns;
DELETE FROM distributor_campaigns;
DELETE FROM product_layers;
DELETE FROM products;
DELETE FROM users;
DELETE FROM dealers;
DELETE FROM distributors;
DELETE FROM reward_catalog;
DELETE FROM signup_applications;
DELETE FROM system_settings;

PRAGMA foreign_keys = ON;
