-- Standardized dealer codes (FIRST4-PINCODE[-N]).
--
-- New dealers get the standardized code at creation (api/services/dealer-code.ts). For EXISTING
-- dealers we preserve their current code as a historical/reference value in `legacy_code` before a
-- backfill script rewrites `code` to the new format. ADD-only (no table rebuild) so it is safe on a
-- populated D1 database.
--
-- Backfill of the new-format `code` values is done by scripts/backfill-dealer-codes.ts (it needs
-- the letters-only prefix + sequential-duplicate logic that can't be expressed in SQLite string
-- functions). This migration only adds the column and snapshots the old code.

ALTER TABLE dealers ADD COLUMN legacy_code TEXT;

-- Snapshot the current code as the legacy/historical value (only where not already set).
UPDATE dealers SET legacy_code = code WHERE legacy_code IS NULL;
