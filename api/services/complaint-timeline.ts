import { id, nowIso, formatInLabel } from "../utils";

export async function insertComplaintTimelineEvent(
  db: D1Database,
  input: {
    complaintId: string;
    eventKey: string;
    label: string;
    note?: string | null;
    actorUserId?: string | null;
    occurredAt?: string;
  },
) {
  await db
    .prepare(
      `INSERT INTO complaint_timeline_events (id, complaint_id, event_key, label, note, occurred_at, actor_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id("cte"),
      input.complaintId,
      input.eventKey,
      input.label,
      input.note ?? null,
      input.occurredAt ?? nowIso(),
      input.actorUserId ?? null,
    )
    .run();
}

export async function listComplaintTimelineForApi(db: D1Database, complaintId: string) {
  const { results } = await db
    .prepare(
      `SELECT label, note, occurred_at, event_key
       FROM complaint_timeline_events
       WHERE complaint_id = ?
       ORDER BY occurred_at ASC`,
    )
    .bind(complaintId)
    .all<{ label: string; note: string | null; occurred_at: string; event_key: string }>();

  return results.map((row) => ({
    label: row.label,
    at: formatInLabel(row.occurred_at),
    note: row.note ?? undefined,
    status: row.event_key !== "submitted" ? row.event_key : undefined,
  }));
}
