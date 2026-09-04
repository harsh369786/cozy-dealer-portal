-- Scheduled announcements: hold announcements whose sendAt is in the future until the cron
-- dispatches them. ADD-only (new table + index) — safe on populated D1; never rebuilds an
-- FK-referenced table. Before this, createAnnouncement fanned out notification rows immediately
-- regardless of sendAt, so "schedule for later" sent right away.
CREATE TABLE IF NOT EXISTS scheduled_announcements (
  id TEXT PRIMARY KEY,
  announcement_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT NOT NULL,
  audience TEXT NOT NULL,
  popup_enabled INTEGER NOT NULL DEFAULT 0,
  max_impressions INTEGER NOT NULL DEFAULT 0,
  send_at TEXT NOT NULL,
  sent INTEGER NOT NULL DEFAULT 0,
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- The cron selects due, unsent rows: WHERE sent = 0 AND send_at <= now.
CREATE INDEX IF NOT EXISTS idx_scheduled_announcements_due
  ON scheduled_announcements(sent, send_at);
