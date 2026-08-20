import { id, nowIso } from "../utils";

export async function enqueueWhatsapp(
  db: D1Database,
  env: { WHATSAPP_QUEUE?: Queue },
  input: { toPhone: string; templateKey: string; payload: Record<string, unknown> },
) {
  const outboxId = id("wa");
  await db
    .prepare(
      `INSERT INTO whatsapp_outbox (id, to_phone, template_key, payload, status, scheduled_at) VALUES (?, ?, ?, ?, 'pending', ?)`,
    )
    .bind(outboxId, input.toPhone, input.templateKey, JSON.stringify(input.payload), nowIso())
    .run();

  if (env.WHATSAPP_QUEUE) {
    await env.WHATSAPP_QUEUE.send({ outboxId });
  } else if (typeof process !== "undefined") {
    console.info(`[whatsapp:mock] ${input.templateKey} → ${input.toPhone}`, input.payload);
  }
}

export async function processWhatsappOutbox(db: D1Database, outboxId: string) {
  const row = await db
    .prepare(`SELECT * FROM whatsapp_outbox WHERE id = ?`)
    .bind(outboxId)
    .first<Record<string, unknown>>();
  if (!row || row.status !== "pending") return;

  const sentAt = nowIso();
  await db
    .prepare(
      `UPDATE whatsapp_outbox SET status = 'sent', sent_at = ?, attempts = attempts + 1, provider_message_id = ? WHERE id = ?`,
    )
    .bind(sentAt, `mock-${outboxId}`, outboxId)
    .run();
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

  for (const order of results) {
    const existing = await db
      .prepare(`SELECT id FROM order_reminders WHERE order_id = ? AND reminder_type = 'pending_2h'`)
      .bind(order.id)
      .first();
    if (existing) continue;

    const distUsers = await db
      .prepare(`SELECT id FROM users WHERE distributor_id = ? AND role = 'distributor'`)
      .bind(order.distributor_id)
      .all<{ id: string }>();

    const { createNotification } = await import("./notifications");
    for (const u of distUsers.results) {
      await createNotification(db, {
        recipientUserId: u.id,
        category: "orders",
        type: "order_reminder",
        title: "Order pending approval",
        body: `Order ${order.id} has been pending for over ${hours} hours`,
        link: `/distributor/orders/${order.id}`,
        isReminder: true,
      });
    }

    await db
      .prepare(`INSERT INTO order_reminders (id, order_id, reminder_type, sent_at) VALUES (?, ?, 'pending_2h', ?)`)
      .bind(id("rem"), order.id, nowIso())
      .run();
  }
}
