-- Dedicated master table for broadcast announcements. Previously the admin "announcements" list was
-- reconstructed by reverse-scanning the notifications table (LIMIT 500), which breaks once a single
-- broadcast fans out to 200+ recipients. Storing one master row per announcement makes listing O(1)
-- per announcement and lets recipientCount be a COUNT over notifications.announcement_id.
--
-- ADD-only + idempotent: new table + a nullable FK column on notifications + an index for the COUNT.
CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT,
  metadata TEXT,
  recipient_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Link each fanned-out notification row back to its announcement. Nullable (older rows / non-
-- announcement notifications have NULL). D1 can't add a column IF NOT EXISTS, so the dev runner
-- guards this migration by table existence; on remote it's applied exactly once via migrations.
ALTER TABLE notifications ADD COLUMN announcement_id TEXT REFERENCES announcements(id);

CREATE INDEX IF NOT EXISTS idx_notifications_announcement ON notifications(announcement_id);

-- Backfill: listAnnouncements now reads exclusively from the `announcements` master table, so
-- without this every PREVIOUSLY-sent broadcast would vanish from the Admin dashboard the moment
-- this migration runs. Reconstruct one master row per historical announcement from the existing
-- notification rows (grouped by the announcementId embedded in metadata JSON), and link those
-- notification rows back via the new announcement_id FK.
INSERT OR IGNORE INTO announcements (id, title, body, category, metadata, recipient_count, created_at)
SELECT
  json_extract(metadata, '$.announcementId') AS id,
  title, body, category, metadata,
  COUNT(*) AS recipient_count,
  MIN(created_at) AS created_at
FROM notifications
WHERE type = 'announcement'
  AND json_extract(metadata, '$.announcementId') IS NOT NULL
GROUP BY json_extract(metadata, '$.announcementId');

-- Backfill announcement_id FK on existing notification rows so recipientCount COUNTs match.
UPDATE notifications
SET announcement_id = json_extract(metadata, '$.announcementId')
WHERE type = 'announcement'
  AND announcement_id IS NULL
  AND json_extract(metadata, '$.announcementId') IS NOT NULL;
