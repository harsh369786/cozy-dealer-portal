-- Human-facing complaint number CP-DDMMYYNN (per-date sequence), separate from the internal id PK
-- so existing complaint records and their links are not broken.

CREATE TABLE IF NOT EXISTS complaint_sequences (
  date_prefix TEXT PRIMARY KEY,
  last_value INTEGER NOT NULL CHECK (last_value >= 0)
);

ALTER TABLE complaints ADD COLUMN complaint_number TEXT;

-- Backfill existing complaints with a stable display number. Existing rows keep working; we
-- reuse their internal id as the visible number where no formatted number exists yet.
UPDATE complaints SET complaint_number = id WHERE complaint_number IS NULL;

CREATE INDEX IF NOT EXISTS idx_complaints_number ON complaints(complaint_number);
