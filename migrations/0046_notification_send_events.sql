-- Notification Template -> Send Event -> per-recipient model.
--
-- The existing `announcements` table becomes the TEMPLATE store (title/body/category/audiences +
-- popup settings, saved once). Each Send / Send-Again action creates one row here — a SEND EVENT
-- with its own unique id — so a template can be sent repeatedly without duplicating the template,
-- and each send's delivery/read history is preserved independently (per-recipient `notifications`
-- rows carry the send_event_id).
--
-- Scheduled sends live here with status='scheduled' + a future send_at; the every-15-min cron
-- dispatches due rows and flips them to status='sent' exactly once (idempotent). Send-Now rows are
-- created with status='sent' and fanned out immediately.
--
-- ADD-only (new table + a nullable column + indexes) — safe on populated D1, no table rebuild.
CREATE TABLE IF NOT EXISTS notification_send_events (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,                 -- -> announcements.id (the reusable template)
  title TEXT NOT NULL,                       -- snapshot at send time (history stays correct if template later edited)
  body TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'system',
  audiences TEXT NOT NULL DEFAULT '[]',      -- JSON array, e.g. ["all_dealers","all_distributors"]
  popup_enabled INTEGER NOT NULL DEFAULT 0,
  popup_max_per_day INTEGER NOT NULL DEFAULT 1,
  send_at TEXT NOT NULL,                      -- UTC ISO instant (scheduled time, or creation time for send-now)
  status TEXT NOT NULL DEFAULT 'scheduled',  -- 'scheduled' | 'sent'
  sent_at TEXT,
  recipient_count INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Cron finds due scheduled sends: WHERE status='scheduled' AND send_at <= now.
CREATE INDEX IF NOT EXISTS idx_notification_send_events_due
  ON notification_send_events(status, send_at);
CREATE INDEX IF NOT EXISTS idx_notification_send_events_template
  ON notification_send_events(template_id);

-- Link each fanned-out per-recipient notification to its send event (alongside the existing
-- announcement_id = template id). Nullable: older rows / non-announcement notifications are NULL.
ALTER TABLE notifications ADD COLUMN send_event_id TEXT;

CREATE INDEX IF NOT EXISTS idx_notifications_send_event ON notifications(send_event_id);
