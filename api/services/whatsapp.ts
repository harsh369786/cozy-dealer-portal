import { id, nowIso } from "../utils";
import type { ApiEnv } from "../types";
import {
  businessEventForTemplate,
  formatGupshupPhone,
  getTemplateDef,
} from "../../shared/whatsapp-templates";
import { isGupshupConfigured, sendGupshupTemplate, fetchGupshupMessageStatus } from "./gupshup";

/**
 * Queue a WhatsApp message into the durable outbox. The actual Gupshup send happens later in
 * processWhatsappOutbox (queue consumer / internal endpoint), so a send failure NEVER blocks the
 * business operation that enqueued it.
 *
 * Idempotency: when a stable `referenceId` is provided (order id / campaign id), the row is inserted
 * with `INSERT OR IGNORE` against the UNIQUE(reference_id, template_key) index (migration 0043) — so
 * re-enqueuing the same event for the same entity (retry, re-fired status, re-saved campaign) is a
 * no-op and can't send a duplicate. OTP has no referenceId (capped by the OTP phone rate limiter).
 *
 * This function is intentionally best-effort and must not throw into its caller: any DB error here
 * is swallowed so order/campaign/OTP flows always succeed.
 */
export async function enqueueWhatsapp(
  db: D1Database,
  env: { WHATSAPP_QUEUE?: Queue },
  input: {
    toPhone: string;
    templateKey: string;
    payload: Record<string, unknown>;
    referenceId?: string | null;
    businessEvent?: string | null;
  },
) {
  try {
    const outboxId = id("wa");
    const businessEvent = input.businessEvent ?? businessEventForTemplate(input.templateKey);
    const result = await db
      .prepare(
        `INSERT OR IGNORE INTO whatsapp_outbox
           (id, to_phone, template_key, payload, status, scheduled_at, reference_id, business_event)
         VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)`,
      )
      .bind(
        outboxId,
        input.toPhone,
        input.templateKey,
        JSON.stringify(input.payload),
        nowIso(),
        input.referenceId ?? null,
        businessEvent,
      )
      .run();

    // If the OR IGNORE hit the unique index (duplicate event), don't queue a send.
    if ((result.meta.changes ?? 0) === 0) return null;

    if (env.WHATSAPP_QUEUE) {
      await env.WHATSAPP_QUEUE.send({ outboxId });
    }
    // Return the id so time-critical callers (OTP) can also process it synchronously instead of
    // waiting on the queue consumer / cron sweep.
    return outboxId;
  } catch (err) {
    // Never let a notification enqueue break the caller. Log a safe, value-free reason.
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[whatsapp] enqueue failed for ${input.templateKey}: ${message}`);
    return null;
  }
}

/**
 * Send one queued outbox row via Gupshup. Idempotent on status (skips anything not 'pending').
 * Marks the row 'sent' (with the Gupshup message id) or 'failed' (with a safe error) — never throws.
 * When Gupshup isn't configured the row is left 'pending' (so it sends once configured) unless the
 * template/phone is fundamentally unusable, in which case it's marked 'failed'.
 */
export async function processWhatsappOutbox(db: D1Database, env: ApiEnv, outboxId: string) {
  const row = await db
    .prepare(`SELECT * FROM whatsapp_outbox WHERE id = ?`)
    .bind(outboxId)
    .first<Record<string, unknown>>();
  if (!row || row.status !== "pending") return;

  const templateKey = String(row.template_key);
  const def = getTemplateDef(templateKey);

  const markFailed = async (error: string) => {
    await db
      .prepare(
        `UPDATE whatsapp_outbox SET status = 'failed', attempts = attempts + 1, error = ? WHERE id = ?`,
      )
      .bind(error.slice(0, 500), outboxId)
      .run();
  };

  if (!def) {
    await markFailed(`Unknown template: ${templateKey}`);
    return;
  }

  // Not configured yet: leave 'pending' so it goes out once GUPSHUP_* is set (don't burn the row).
  if (!isGupshupConfigured(env)) return;

  const destination = formatGupshupPhone(String(row.to_phone ?? ""));
  if (!destination) {
    await markFailed("Invalid destination phone");
    return;
  }

  const templateId = def.resolveTemplateId(env);
  if (!templateId) {
    await markFailed(`Template id not configured for ${templateKey}`);
    return;
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(String(row.payload ?? "{}")) as Record<string, unknown>;
  } catch {
    payload = {};
  }
  const params = def.buildParams(payload);

  const result = await sendGupshupTemplate(env, { destination, templateId, params });
  if (result.ok) {
    await db
      .prepare(
        `UPDATE whatsapp_outbox SET status = 'sent', sent_at = ?, attempts = attempts + 1, provider_message_id = ?, error = NULL WHERE id = ?`,
      )
      .bind(nowIso(), result.providerMessageId, outboxId)
      .run();
  } else {
    await markFailed(result.error);
  }
}

/**
 * Admin log: recent WhatsApp outbox rows, newest first. Returns safe fields only (never any Gupshup
 * credential; the payload column is intentionally omitted so no OTP value is ever exposed).
 */
export async function listWhatsappOutbox(
  db: D1Database,
  filters: { limit?: number; status?: string } = {},
) {
  const limit = Math.min(200, Math.max(1, filters.limit ?? 100));
  let sql = `SELECT id, to_phone, template_key, business_event, reference_id, status,
                    provider_message_id, error, attempts, scheduled_at, sent_at
             FROM whatsapp_outbox`;
  const binds: unknown[] = [];
  if (filters.status && filters.status !== "all") {
    sql += ` WHERE status = ?`;
    binds.push(filters.status);
  }
  sql += ` ORDER BY scheduled_at DESC LIMIT ?`;
  binds.push(limit);
  const { results } = await db.prepare(sql).bind(...binds).all<Record<string, unknown>>();
  return results.map((r) => ({
    id: r.id as string,
    toPhone: maskPhone(r.to_phone as string),
    templateKey: r.template_key as string,
    businessEvent: (r.business_event as string) ?? null,
    referenceId: (r.reference_id as string) ?? null,
    status: r.status as string,
    providerMessageId: (r.provider_message_id as string) ?? null,
    error: (r.error as string) ?? null,
    attempts: Number(r.attempts ?? 0),
    scheduledAt: r.scheduled_at as string,
    sentAt: (r.sent_at as string) ?? null,
  }));
}

/**
 * Check the REAL delivery status of an outbox row from Gupshup (delivered / read / failed + reason),
 * so an admin can see why a "sent" message never arrived. Looks up the row's provider_message_id
 * then queries Gupshup. Read-only; never throws.
 */
export async function checkWhatsappDeliveryStatus(
  db: D1Database,
  env: ApiEnv & { GUPSHUP_APP_ID?: string },
  outboxId: string,
) {
  const row = await db
    .prepare(`SELECT provider_message_id, status FROM whatsapp_outbox WHERE id = ?`)
    .bind(outboxId)
    .first<{ provider_message_id: string | null; status: string }>();
  if (!row) return { ok: false as const, error: "Message not found" };
  if (!row.provider_message_id) {
    return {
      ok: false as const,
      error:
        row.status === "pending"
          ? "Not sent yet (pending) — no provider message id to check."
          : "No provider message id recorded for this message.",
    };
  }
  return fetchGupshupMessageStatus(env, row.provider_message_id);
}

/** Mask the middle of a phone for the admin log (e.g. +9198****5853). Not a security control. */
function maskPhone(phone: string | null | undefined): string {
  const s = String(phone ?? "");
  if (s.length <= 6) return s;
  return `${s.slice(0, 5)}****${s.slice(-4)}`;
}

/** Sample payloads for the test endpoint — mirror the Gupshup-approved template samples exactly. */
const TEST_PAYLOADS: Record<string, Record<string, unknown>> = {
  otp_for_login: { otp: "123456", purpose: "Login" },
  mattress_order_placed: {
    name: "Rajesh",
    model: "AquaFresh",
    orderNo: "BR-14102603",
    length: '73.25"',
    width: '66"',
    thickness: '6.5"',
    farma: "Yes",
    quantity: "1 Piece",
    freeScheme: "2 Fiber pillows, 1 wedge pillow",
    rewardPoints: "5544 Points",
    placedBy: "Santosh",
  },
  mattress_order_rejection: {
    name: "Rajesh",
    orderNo: "BR-44444444",
    model: "Ortho Plush",
    reason: "Wrong size entered",
    length: '72"',
    width: '66"',
    thickness: '6"',
    quantity: "1 Piece",
    placedBy: "Sanjay",
  },
  mattress_delivered: {
    name: "Rajesh",
    orderNo: "BR-44444444",
    model: "Ortho Plush",
    length: '77"',
    width: '66"',
    thickness: '6"',
    quantity: "1 Piece",
    freeScheme: "1 fiber pillow, 1 wedge pillow",
    placedBy: "sanjay",
  },
  campaign_live: {},
};

/**
 * Send ONE of the five approved templates to a designated test number with representative sample
 * data. No free-form messages. Sends synchronously through the Gupshup client and returns the raw
 * result so an admin/tester can see success/failure immediately. Test rows are marked in the outbox
 * with business_event 'TEST' and are NOT deduped (referenceId null).
 */
export async function sendWhatsappTest(
  db: D1Database,
  env: ApiEnv,
  templateKey: string,
  toPhone: string,
): Promise<{ ok: boolean; error?: string; providerMessageId?: string | null }> {
  const def = getTemplateDef(templateKey);
  if (!def) return { ok: false, error: `Unknown template: ${templateKey}` };
  if (!isGupshupConfigured(env)) return { ok: false, error: "Gupshup not configured" };

  const destination = formatGupshupPhone(toPhone);
  if (!destination) return { ok: false, error: "Invalid test phone" };

  const templateId = def.resolveTemplateId(env);
  if (!templateId) return { ok: false, error: `Template id not configured for ${templateKey}` };

  const params = def.buildParams(TEST_PAYLOADS[templateKey] ?? {});

  // Log the attempt in the outbox (visible in the admin log), then send synchronously.
  const outboxId = id("wa");
  await db
    .prepare(
      `INSERT INTO whatsapp_outbox (id, to_phone, template_key, payload, status, scheduled_at, business_event)
       VALUES (?, ?, ?, ?, 'pending', ?, 'TEST')`,
    )
    .bind(outboxId, toPhone, templateKey, JSON.stringify(TEST_PAYLOADS[templateKey] ?? {}), nowIso())
    .run();

  const result = await sendGupshupTemplate(env, { destination, templateId, params });
  if (result.ok) {
    await db
      .prepare(
        `UPDATE whatsapp_outbox SET status = 'sent', sent_at = ?, attempts = attempts + 1, provider_message_id = ? WHERE id = ?`,
      )
      .bind(nowIso(), result.providerMessageId, outboxId)
      .run();
    return { ok: true, providerMessageId: result.providerMessageId };
  }
  await db
    .prepare(`UPDATE whatsapp_outbox SET status = 'failed', attempts = attempts + 1, error = ? WHERE id = ?`)
    .bind(result.error.slice(0, 500), outboxId)
    .run();
  return { ok: false, error: result.error };
}

/**
 * Safety-net sweeper (run from cron): send any outbox rows still 'pending'. Covers messages queued
 * without a live queue binding, transient queue misses, or rows that were pending before Gupshup was
 * configured. Bounded per run so a backlog can't blow the cron budget. No-op when Gupshup is unset.
 */
export async function dispatchPendingWhatsapp(db: D1Database, env: ApiEnv, limit = 50) {
  if (!isGupshupConfigured(env)) return { attempted: 0 };
  const { results } = await db
    .prepare(`SELECT id FROM whatsapp_outbox WHERE status = 'pending' ORDER BY scheduled_at LIMIT ?`)
    .bind(limit)
    .all<{ id: string }>();
  for (const row of results) {
    await processWhatsappOutbox(db, env, row.id);
  }
  return { attempted: results.length };
}

export async function scanPendingOrderReminders(db: D1Database) {
  const setting = await db
    .prepare(`SELECT value FROM system_settings WHERE key = 'pending_reminder_hours'`)
    .first<{ value: string }>();
  const hours = Number(setting?.value ?? 2);

  const { results } = await db
    .prepare(
      `SELECT o.id, o.dealer_id, o.distributor_id, o.placed_at
       FROM orders o
       WHERE o.status IN ('order_placed', 'pending_approval') AND o.deleted_at IS NULL
         AND datetime(o.placed_at) <= datetime('now', ?)`,
    )
    .bind(`-${hours} hours`)
    .all<{ id: string; dealer_id: string; distributor_id: string; placed_at: string }>();

  // Pre-fetch already-reminded order ids in one query instead of one SELECT per order (N+1).
  const alreadyReminded = new Set<string>();
  if (results.length) {
    const placeholders = results.map(() => "?").join(",");
    const { results: reminded } = await db
      .prepare(
        `SELECT order_id FROM order_reminders WHERE reminder_type = 'pending_2h' AND order_id IN (${placeholders})`,
      )
      .bind(...results.map((o) => o.id))
      .all<{ order_id: string }>();
    for (const r of reminded) alreadyReminded.add(r.order_id);
  }

  for (const order of results) {
    if (alreadyReminded.has(order.id)) continue;

    const distUsers = await db
      .prepare(
        `SELECT id FROM users WHERE distributor_id = ? AND role = 'distributor' AND status = 'active' AND deleted_at IS NULL`,
      )
      .bind(order.distributor_id)
      .all<{ id: string }>();

    const { createNotification } = await import("./notifications");
    const { withNotificationI18n } = await import("./notification-events");
    for (const u of distUsers.results) {
      await createNotification(db, {
        recipientUserId: u.id,
        category: "orders",
        type: "order_reminder",
        title: "Order pending approval",
        body: `Order ${order.id} has been pending for over ${hours} hours`,
        link: `/distributor/orders/${order.id}`,
        isReminder: true,
        ...withNotificationI18n(
          "notifications.orderPendingApproval.title",
          "notifications.orderPendingApproval.body",
          { orderId: order.id, hours },
        ),
      });
    }

    await db
      .prepare(`INSERT INTO order_reminders (id, order_id, reminder_type, sent_at) VALUES (?, ?, 'pending_2h', ?)`)
      .bind(id("rem"), order.id, nowIso())
      .run();
  }
}
