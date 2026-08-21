import { id, nowIso } from "../utils";

export async function createNotification(
  db: D1Database,
  input: {
    recipientUserId: string;
    category: string;
    type: string;
    title: string;
    body: string;
    link?: string;
    isReminder?: boolean;
    metadata?: Record<string, unknown>;
  },
) {
  await db
    .prepare(
      `INSERT INTO notifications (id, recipient_user_id, category, type, title, body, link, read, is_reminder, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    )
    .bind(
      id("ntf"),
      input.recipientUserId,
      input.category,
      input.type,
      input.title,
      input.body,
      input.link ?? null,
      input.isReminder ? 1 : 0,
      input.metadata ? JSON.stringify(input.metadata) : null,
      nowIso(),
    )
    .run();
}

export async function createNotificationsBatch(
  db: D1Database,
  inputs: Array<{
    recipientUserId: string;
    category: string;
    type: string;
    title: string;
    body: string;
    link?: string;
    isReminder?: boolean;
    metadata?: Record<string, unknown>;
  }>,
) {
  if (!inputs.length) return;
  const ts = nowIso();
  const BATCH_SIZE = 80;

  for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
    const chunk = inputs.slice(i, i + BATCH_SIZE);
    await db.batch(
      chunk.map((input) =>
        db
          .prepare(
            `INSERT INTO notifications (id, recipient_user_id, category, type, title, body, link, read, is_reminder, metadata, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
          )
          .bind(
            id("ntf"),
            input.recipientUserId,
            input.category,
            input.type,
            input.title,
            input.body,
            input.link ?? null,
            input.isReminder ? 1 : 0,
            input.metadata ? JSON.stringify(input.metadata) : null,
            ts,
          ),
      ),
    );
  }
}

export async function listNotifications(db: D1Database, userId: string) {
  const { results } = await db
    .prepare(
      `SELECT * FROM notifications WHERE recipient_user_id = ? ORDER BY created_at DESC LIMIT 100`,
    )
    .bind(userId)
    .all<Record<string, unknown>>();

  return results.map((n) => ({
    id: n.id,
    category: n.category,
    type: n.type,
    title: n.title,
    body: n.body,
    link: n.link,
    createdAt: n.created_at,
    read: Boolean(n.read),
    isReminder: Boolean(n.is_reminder),
  }));
}
