-- Gupshup WhatsApp integration: extend the existing whatsapp_outbox for real sending, failure
-- tracking, an admin log, and idempotency. ADD-only (new columns + index) — the outbox table and
-- its existing 'pending'/'sent' flow are unchanged; we just add a 'failed' status value (no CHECK
-- constraint exists, so no rebuild) plus tracking columns.
--
--   business_event  : the domain event that triggered the message (ORDER_PLACED, ORDER_REJECTED,
--                     ORDER_DELIVERED, CAMPAIGN_LIVE, LOGIN_OTP) — for the admin log.
--   reference_id    : the entity the message is about (order id / campaign id). NULL for OTP.
--   error           : safe failure reason when status='failed' (never contains OTP/secrets).
--   language        : Gupshup template language code (defaults handled in code).
--
-- Idempotency: a UNIQUE index on (reference_id, template_key) makes re-enqueuing the same event for
-- the same entity a no-op (INSERT OR IGNORE), so an order edited/retried, a re-fired status change,
-- or a re-saved campaign can't send a duplicate WhatsApp. OTP rows have reference_id NULL and are
-- excluded from the index (they're capped by the OTP phone rate limiter instead).
ALTER TABLE whatsapp_outbox ADD COLUMN business_event TEXT;
ALTER TABLE whatsapp_outbox ADD COLUMN reference_id TEXT;
ALTER TABLE whatsapp_outbox ADD COLUMN error TEXT;
ALTER TABLE whatsapp_outbox ADD COLUMN language TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_outbox_event_ref
  ON whatsapp_outbox (reference_id, template_key)
  WHERE reference_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_outbox_status ON whatsapp_outbox (status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_outbox_created ON whatsapp_outbox (scheduled_at);
