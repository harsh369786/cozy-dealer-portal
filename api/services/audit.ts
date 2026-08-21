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

function parseJson(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function label(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function entityName(data: Record<string, unknown> | null, fallback?: string | null) {
  return (
    label(data?.name) ??
    label(data?.title) ??
    label(data?.storeName) ??
    label(data?.businessName) ??
    fallback ??
    "record"
  );
}

function describeChanges(before: Record<string, unknown> | null, after: Record<string, unknown> | null) {
  if (!before || !after) return null;
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const changes: string[] = [];
  for (const key of keys) {
    const prev = before[key];
    const next = after[key];
    if (JSON.stringify(prev) === JSON.stringify(next)) continue;
    const readable = key
      .replace(/([A-Z])/g, " $1")
      .replace(/_/g, " ")
      .trim()
      .toLowerCase();
    const prevLabel = label(prev) ?? (prev == null ? "empty" : "updated");
    const nextLabel = label(next) ?? (next == null ? "empty" : "updated");
    changes.push(`${readable} from ${prevLabel} to ${nextLabel}`);
  }
  if (!changes.length) return null;
  return changes.slice(0, 3).join("; ");
}

export function formatAuditSummary(row: Record<string, unknown>): string {
  const action = String(row.action ?? "");
  const entityType = String(row.entity_type ?? "item");
  const entityId = label(row.entity_id);
  const before = parseJson(row.before_json);
  const after = parseJson(row.after_json);
  const name = entityName(after ?? before, entityId);
  const changes = describeChanges(before, after);

  switch (action) {
    case "product.create":
      return `Added product ${name}`;
    case "product.update":
      return changes ? `Updated product ${name}: ${changes}` : `Updated product ${name}`;
    case "product.archive":
      return `Archived product ${name}`;
    case "product.restore":
      return `Restored product ${name}`;
    case "campaign.create":
      return `Created campaign ${name}`;
    case "campaign.update":
      return changes ? `Updated campaign ${name}: ${changes}` : `Updated campaign ${name}`;
    case "campaign.archive":
      return `Archived campaign ${name}`;
    case "campaign.activate":
      return `Activated campaign ${name}`;
    case "reward_catalog.create":
      return `Created reward ${name}`;
    case "reward_catalog.update":
      return changes ? `Updated reward ${name}: ${changes}` : `Updated reward ${name}`;
    case "reward_catalog.archive":
      return `Archived reward ${name}`;
    case "reward_claim.update_status":
      return `Marked reward claim ${entityId ?? name} as ${label(after?.status) ?? "updated"}`;
    case "reward_claim.undo":
      return `Reversed reward claim ${entityId ?? name} and returned points`;
    case "user.create":
      return `Created user ${name}`;
    case "user.update":
      return changes ? `Updated user ${name}: ${changes}` : `Updated user ${name}`;
    case "user.suspend":
      return `Suspended user ${name}`;
    case "user.activate":
      return `Reactivated user ${name}`;
    case "user.delete":
      return `Deleted user ${name}`;
    case "user.invite.whatsapp":
      return `Sent WhatsApp invite to ${label(after?.phone) ?? name}`;
    case "user.invite.whatsapp.resend":
      return `Resent WhatsApp invite to ${label(after?.phone) ?? name}`;
    case "assignment.bulk":
      return `Updated assignments for ${label(after?.count) ?? "multiple"} dealers`;
    case "signup.approve":
      return `Approved signup application ${entityId ?? name}`;
    case "signup.reject":
      return `Rejected signup application ${entityId ?? name}`;
    default:
      if (action.startsWith("assignment.")) {
        return changes
          ? `Changed dealer assignment for ${name}: ${changes}`
          : `Changed dealer assignment for ${name}`;
      }
      return changes
        ? `${action.replace(/[._]/g, " ")} on ${entityType} ${name}: ${changes}`
        : `${action.replace(/[._]/g, " ")} on ${entityType} ${name}`;
  }
}

export async function listAuditLogs(db: D1Database, opts: { limit?: number } = {}) {
  const limit = Math.min(500, Math.max(1, opts.limit ?? 200));
  const { results } = await db
    .prepare(
      `SELECT a.*, u.name as actor_name, u.role as actor_role
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.actor_user_id
       ORDER BY a.created_at DESC
       LIMIT ?`,
    )
    .bind(limit)
    .all<Record<string, unknown>>();

  return results.map((row) => ({
    id: row.id as string,
    created_at: row.created_at as string,
    actor_name: (row.actor_name as string) ?? "System",
    actor_role: (row.actor_role as string) ?? "master_admin",
    action: row.action as string,
    entity_type: row.entity_type as string,
    entity_id: (row.entity_id as string) ?? "",
    summary: formatAuditSummary(row),
  }));
}
