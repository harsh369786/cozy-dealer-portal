import { id, nowIso, formatInLabel } from "../utils";
import { snapshotPushContext, runBackground } from "../push-env";
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
  /** Links a fanned-out notification back to its announcements-master row (P2-3). */
  announcementId?: string | null;
  /** Links a fanned-out notification to its specific send event (Template -> Send Event). */
  sendEventId?: string | null;
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
  options?: { skipPush?: boolean },
) {
  const notificationId = id("ntf");
  const ts = nowIso();
  await db
    .prepare(
      `INSERT INTO notifications (id, recipient_user_id, category, type, title, body, link, read, is_reminder, metadata, announcement_id, send_event_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
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
      input.announcementId ?? null,
      input.sendEventId ?? null,
      ts,
    )
    .run();

  const created: CreatedNotification = { id: notificationId, ...input };
  // Callers that want to send push synchronously (e.g. the test endpoint, to surface the real
  // delivery result) pass skipPush and call sendPushForNotifications themselves.
  if (options?.skipPush) return created;
  // Capture env + execution context together, then bind the background send to THAT context
  // so a concurrent request can't swap it out and truncate delivery.
  const { env, ctx } = snapshotPushContext();
  if (env) {
    runBackground(ctx, sendPushForNotifications(env, [created]));
  } else {
    console.error("[push] createNotification: no push env captured (snapshotPushContext env=null)");
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
            `INSERT INTO notifications (id, recipient_user_id, category, type, title, body, link, read, is_reminder, metadata, announcement_id, send_event_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
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
            input.announcementId ?? null,
            input.sendEventId ?? null,
            ts,
          ),
      ),
    );
  }

  const { env, ctx } = snapshotPushContext();
  if (env && created.length) {
    runBackground(ctx, sendPushForNotifications(env, created));
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