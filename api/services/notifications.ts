import { id, nowIso, formatInLabel } from "../utils";
import { getPushEnv, waitUntil } from "../push-env";
import { sendPushForNotifications } from "./push-notifications";

export type NotificationInsertInput = {
  recipientUserId: string;
  category: string;
  type: string;
  title: string;
  body: string;
  link?: string;
  isReminder?: boolean;
  metadata?: Record<string, unknown>;
};

export type CreatedNotification = NotificationInsertInput & { id: string };

function parseMetadata(raw: unknown): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== "string") return undefined;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return typeof parsed === "object" && parsed !== null ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function mapNotificationRow(n: Record<string, unknown>) {
  const createdAtIso = String(n['created_at'] ?? "");
  return {
    id: n['id'],
    category: n['category'],
    type: n['type'],
    title: n['title'],
    body: n['body'],
    link: n['link'],
    createdAt: createdAtIso,
    createdAtLabel: formatInLabel(createdAtIso),
    read: Boolean(n['read']),
    isReminder: Boolean(n['is_reminder']),
    metadata: parseMetadata(n['metadata']),
  };
}

export async function createNotification(
  db: D1Database,
  input: NotificationInsertInput,
) {
  const notificationId = id("ntf");
  const ts = nowIso();
  await db
    .prepare(
      `INSERT INTO notifications (id, recipient_user_id, category, type, title, body, link, read, is_reminder, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    )
    .bind(
      notificationId,
      input.recipientUserId,
      input.category,
      input.type,
      input.title,
      input.body,
      input.link ?? null,
      input.isReminder ? 1 : 0,
      input.metadata ? JSON.stringify(input.metadata) : null,
      ts,
    )
    .run();

  const created: CreatedNotification = { id: notificationId, ...input };
  const env = getPushEnv();
  if (env) {
    waitUntil(
      sendPushForNotifications(env, [created]).catch((err) => {
        console.error("Push delivery failed:", err);
      }),
    );
  }
  return created;
}

export async function createNotificationsBatch(
  db: D1Database,
  inputs: NotificationInsertInput[],
) {
  if (!inputs.length) return [] as CreatedNotification[];
  const ts = nowIso();
  const BATCH_SIZE = 80;
  const created: CreatedNotification[] = [];

  for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
    const chunk = inputs.slice(i, i + BATCH_SIZE);
    const rows = chunk.map((input) => ({ id: id("ntf"), ...input }));
    created.push(...rows);
    await db.batch(
      rows.map((input) =>
        db
          .prepare(
            `INSERT INTO notifications (id, recipient_user_id, category, type, title, body, link, read, is_reminder, metadata, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
          )
          .bind(
            input.id,
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

  const env = getPushEnv();
  if (env && created.length) {
    waitUntil(
      sendPushForNotifications(env, created).catch((err) => {
        console.error("Push delivery failed:", err);
      }),
    );
  }

  return created;
}

export async function listNotifications(
  db: D1Database,
  userId: string,
  opts?: { since?: string },
) {
  let sql = `SELECT * FROM notifications WHERE recipient_user_id = ?`;
  const binds: unknown[] = [userId];
  if (opts?.since) {
    sql += ` AND created_at > ?`;
    binds.push(opts.since);
  }
  sql += ` ORDER BY created_at DESC LIMIT 100`;

  const { results } = await db.prepare(sql).bind(...binds).all<Record<string, unknown>>();
  return results.map(mapNotificationRow);
}

export async function getUnreadNotificationCount(db: D1Database, userId: string) {
  const row = await db
    .prepare(`SELECT COUNT(*) as c FROM notifications WHERE recipient_user_id = ? AND read = 0`)
    .bind(userId)
    .first<{ c: number }>();
  return row?.c ?? 0;
}