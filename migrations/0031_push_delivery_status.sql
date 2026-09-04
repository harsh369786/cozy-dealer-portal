-- Push delivery instrumentation: record the outcome of each push send per subscription so a
-- broken subscription is diagnosable and the polling fallback can decide whether push is
-- actually working. ADD-only (safe on D1 — never rebuilds the FK-referenced table).
--   last_attempt_at : ISO timestamp of the most recent push send attempt
--   last_status     : HTTP status returned by the push provider (200/201/401/403/404/410/...)
--   failure_count   : consecutive non-2xx attempts (reset to 0 on a 2xx)

ALTER TABLE push_subscriptions ADD COLUMN last_attempt_at TEXT;
ALTER TABLE push_subscriptions ADD COLUMN last_status INTEGER;
ALTER TABLE push_subscriptions ADD COLUMN failure_count INTEGER NOT NULL DEFAULT 0;
