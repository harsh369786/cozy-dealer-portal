import { id, nowIso } from "../utils";

export async function writeAuditLog(
  db: D1Database,
  input: {
    actorUserId: string;
    action: string;
    entityType: string;
    entityId?: string;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    ip?: string | null;
  },
) {
  await db
    .prepare(
      `INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, before_json, after_json, ip, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id("aud"),
      input.actorUserId,
      input.action,
      input.entityType,
      input.entityId ?? null,
      input.before ? JSON.stringify(input.before) : null,
      input.after ? JSON.stringify(input.after) : null,
      input.ip ?? null,
      nowIso(),
    )
    .run();
}
