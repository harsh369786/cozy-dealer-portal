-- Complaint timeline events + campaign notification dedupe
CREATE TABLE IF NOT EXISTS complaint_timeline_events (
  id TEXT PRIMARY KEY NOT NULL,
  complaint_id TEXT NOT NULL REFERENCES complaints(id),
  event_key TEXT NOT NULL,
  label TEXT NOT NULL,
  note TEXT,
  occurred_at TEXT NOT NULL,
  actor_user_id TEXT REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_complaint_timeline_complaint ON complaint_timeline_events(complaint_id, occurred_at);

ALTER TABLE price_campaigns ADD COLUMN notifications_sent_at TEXT;
