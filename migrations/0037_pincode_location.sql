-- Pincode-based structured location.
--
-- 1) `pincodes` — India Post master (from `pincode master.csv`). One row per (pincode, area).
--    A pincode can have multiple areas (post offices), so the PK is (pincode, area).
--    Data is loaded separately via a generated SQL file (wrangler d1 execute --file), NOT here,
--    because it is ~165k rows / 22MB.
-- 2) Structured location columns on `dealers` and `signup_applications`. ADD-only, nullable, so
--    existing rows are untouched and the legacy free-text `location`/`address` fields stay as-is.
--
-- Design constraint (learned the hard way): D1 cannot rebuild an FK-referenced table on a
-- populated DB, so this is strictly additive — new table + ADD COLUMN only.

CREATE TABLE IF NOT EXISTS pincodes (
  pincode TEXT NOT NULL,
  state TEXT NOT NULL,
  district TEXT NOT NULL,
  area TEXT NOT NULL,
  PRIMARY KEY (pincode, area)
);

-- Fast lookup by pincode (the signup lookup path).
CREATE INDEX IF NOT EXISTS idx_pincodes_pincode ON pincodes (pincode);

-- Structured location on dealers (nullable; legacy location/address untouched).
ALTER TABLE dealers ADD COLUMN pincode TEXT;
ALTER TABLE dealers ADD COLUMN state TEXT;
ALTER TABLE dealers ADD COLUMN district TEXT;
ALTER TABLE dealers ADD COLUMN area TEXT;

-- Structured location captured at signup.
ALTER TABLE signup_applications ADD COLUMN pincode TEXT;
ALTER TABLE signup_applications ADD COLUMN state TEXT;
ALTER TABLE signup_applications ADD COLUMN district TEXT;
ALTER TABLE signup_applications ADD COLUMN area TEXT;
