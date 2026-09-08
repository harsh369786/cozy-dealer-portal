import { createNotificationsBatch } from "./notifications";
import { id, nowIso, formatInLabel } from "../utils";

export type AnnouncementAudience =
  | "all_dealers"
  | "all_distributors"
  | "all_users"
  | "dealers"
  | "distributors"
  | "admin_staff";

export type AnnouncementInput = {
  title: string;
  body: string;
  category: string;
  audience: AnnouncementAudience;
  sendAt: string;
  popupEnabled: boolean;
  maxImpressions: number;
};

const AUDIENCE_LABELS: Record<AnnouncementAudience, string> = {
  all_dealers: "All dealers",
  all_distributors: "All distributors",
  all_users: "All users",
  dealers: "Dealers",
  distributors: "Distributors",
  admin_staff: "Admin staff",
};

type AnnouncementMetadata = {
  announcementId: string;
  audience: AnnouncementAudience;
  popupEnabled: boolean;
  maxImpressions: number;
  impressionCount: number;
  active: boolean;
  sendAt: string;
};

function parseMetadata(raw: unknown): AnnouncementMetadata | null {
  if (!raw || typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw) as AnnouncementMetadata;
    if (!parsed.announcementId) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function resolveAudienceUsers(
  db: D1Database,
  audience: AnnouncementAudience,
): Promise<Array<{ id: string; role: string }>> {
  let sql = `SELECT id, role FROM users WHERE deleted_at IS NULL AND status = 'active'`;
  if (audience === "all_dealers" || audience === "dealers") {
    sql += ` AND role = 'dealer'`;
  } else if (audience === "all_distributors" || audience === "distributors") {
    sql += ` AND role = 'distributor'`;
  } else if (audience === "admin_staff") {
    sql += ` AND role IN ('admin_staff', 'master_admin')`;
  }
  const { results } = await db.prepare(sql).all<{ id: string; role: string }>();
  return results;
}

function announcementLinkForRole(role: string): string {
  if (role === "distributor" || role === "sales_executive") return "/distributor/notifications";
  if (role === "master_admin" || role === "admin_staff") return "/admin/notifications";
  return "/home";
}

/** True when sendAt parses to a timestamp strictly in the future (relative to now). */
/**
 * Normalize a client-supplied sendAt into a real UTC ISO-8601 instant so it can be compared
 * against nowIso() (also UTC). The admin form ideally sends a full ISO instant with a timezone
 * offset (e.g. "2026-09-04T11:10:00.000Z"); if we instead receive a bare datetime-local string
 * ("2026-09-04T11:10", no zone), Date.parse would interpret it in the WORKER's timezone (UTC),
 * not the admin's — so we cannot reliably recover the intended instant here. In that case we keep
 * the value as-is and let the client fix (below) supply a proper instant. Returns null if
 * unparseable.
 */
function normalizeSendAt(sendAt: string): string | null {
  const t = Date.parse(sendAt);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString();
}

function isFutureSendAt(sendAt: string): boolean {
  const iso = normalizeSendAt(sendAt);
  if (!iso) return false; // unparseable → treat as "send now"
  return Date.parse(iso) > Date.now();
}

/**
 * Fan out an announcement to its audience RIGHT NOW: resolve recipients and create the
 * notification rows (which also trigger push). Shared by the immediate path in
 * createAnnouncement and by the cron dispatcher for due scheduled announcements.
 */
async function sendAnnouncementNow(
  db: D1Database,
  announcementId: string,
  input: AnnouncementInput,
): Promise<number> {
  const recipients = await resolveAudienceUsers(db, input.audience);
  if (!recipients.length) throw new Error("No recipients found for this audience");

  const metadata: AnnouncementMetadata = {
    announcementId,
    audience: input.audience,
    popupEnabled: input.popupEnabled,
    maxImpressions: input.maxImpressions,
    impressionCount: 0,
    active: true,
    sendAt: input.sendAt,
  };

  // P2-3: write ONE master row per announcement first, then fan out the notification rows linked
  // to it via announcement_id. This makes the admin list O(1) per announcement (paginated from the
  // master table) with recipientCount derived from a COUNT, instead of reverse-scanning up to 500
  // notification rows. The metadata JSON is still stored (for audience/popup/impression settings).
  await db
    .prepare(
      `INSERT OR REPLACE INTO announcements (id, title, body, category, metadata, recipient_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      announcementId,
      input.title,
      input.body,
      input.category,
      JSON.stringify(metadata),
      recipients.length,
      nowIso(),
    )
    .run();

  await createNotificationsBatch(
    db,
    recipients.map(({ id: recipientUserId, role }) => ({
      recipientUserId,
      category: input.category,
      type: "announcement",
      title: input.title,
      body: input.body,
      link: announcementLinkForRole(role),
      metadata,
      announcementId,
    })),
  );

  return recipients.length;
}

export async function createAnnouncement(db: D1Database, input: AnnouncementInput) {
  const announcementId = id("ann");

  // Scheduled for later: persist the definition and let the cron dispatch it when due. We still
  // validate the audience up-front so the admin gets immediate feedback if there are no recipients.
  if (isFutureSendAt(input.sendAt)) {
    const recipients = await resolveAudienceUsers(db, input.audience);
    if (!recipients.length) throw new Error("No recipients found for this audience");

    // Store a normalized UTC ISO instant so the cron's send_at <= nowIso() comparison is a true
    // instant comparison (both UTC), not a naive-string vs UTC mismatch.
    const sendAtIso = normalizeSendAt(input.sendAt) ?? input.sendAt;

    await db
      .prepare(
        `INSERT INTO scheduled_announcements
          (id, announcement_id, title, body, category, audience, popup_enabled, max_impressions, send_at, sent, sent_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?)`,
      )
      .bind(
        id("sann"),
        announcementId,
        input.title,
        input.body,
        input.category,
        input.audience,
        input.popupEnabled ? 1 : 0,
        input.maxImpressions,
        sendAtIso,
        nowIso(),
      )
      .run();

    // Return the same shape the UI expects; recipientCount reflects the resolved audience size
    // it is scheduled to reach (nothing has been delivered yet — sendAt is in the future).
    return mapAnnouncementRow(
      announcementId,
      { ...input, sendAt: sendAtIso },
      recipients.length,
      nowIso(),
    );
  }

  // sendAt is now/past (or unparseable): deliver immediately, as before.
  const recipientCount = await sendAnnouncementNow(db, announcementId, input);
  return mapAnnouncementRow(announcementId, input, recipientCount, nowIso());
}

/**
 * Cron step: deliver any scheduled announcements whose send_at has arrived and that haven't been
 * sent yet, then mark them sent. Runs on the every-15-minutes cron (see wrangler.toml), so a
 * scheduled time fires within ~15 min of the requested minute. Each row is marked sent even if
 * delivery throws,
 * to avoid an unbounded retry storm; failures are logged.
 */
export async function dispatchScheduledAnnouncements(db: D1Database): Promise<number> {
  const { results } = await db
    .prepare(
      `SELECT id, announcement_id, title, body, category, audience, popup_enabled, max_impressions, send_at
       FROM scheduled_announcements
       WHERE sent = 0 AND send_at <= ?
       ORDER BY send_at ASC
       LIMIT 100`,
    )
    .bind(nowIso())
    .all<{
      id: string;
      announcement_id: string;
      title: string;
      body: string;
      category: string;
      audience: string;
      popup_enabled: number;
      max_impressions: number;
      send_at: string;
    }>();

  let dispatched = 0;
  for (const row of results) {
    const input: AnnouncementInput = {
      title: row.title,
      body: row.body,
      category: row.category,
      audience: row.audience as AnnouncementAudience,
      sendAt: row.send_at,
      popupEnabled: row.popup_enabled === 1,
      maxImpressions: row.max_impressions,
    };
    try {
      await sendAnnouncementNow(db, row.announcement_id, input);
      dispatched += 1;
    } catch (err) {
      console.error(
        `[cron] dispatchScheduledAnnouncements: failed to send ${row.announcement_id}:`,
        err instanceof Error ? err.message : err,
      );
    }
    // Mark sent regardless, so a persistent failure (e.g. audience now empty) doesn't re-fire
    // every 15 minutes forever.
    await db
      .prepare(`UPDATE scheduled_announcements SET sent = 1, sent_at = ? WHERE id = ?`)
      .bind(nowIso(), row.id)
      .run();
  }

  return dispatched;
}

export async function listAnnouncements(
  db: D1Database,
  opts: { search?: string; category?: string; active?: string; page?: number; pageSize?: number } = {},
) {
  // P2-3: read from the dedicated `announcements` master table (one row per announcement) with the
  // recipient count derived from a COUNT over notifications.announcement_id — instead of reverse-
  // scanning up to 500 notification rows, which broke once a broadcast reached 200+ recipients.
  const { results } = await db
    .prepare(
      `SELECT a.id, a.title, a.body, a.category, a.metadata, a.created_at,
              COALESCE(a.recipient_count, 0) AS stored_count,
              (SELECT COUNT(*) FROM notifications n WHERE n.announcement_id = a.id) AS actual_count
       FROM announcements a
       ORDER BY a.created_at DESC
       LIMIT 500`,
    )
    .all<{
      id: string;
      title: string;
      body: string;
      category: string | null;
      metadata: string | null;
      created_at: string;
      stored_count: number;
      actual_count: number;
    }>();

  let items = results.map((row) => {
    const meta = parseMetadata(row.metadata);
    const audience = meta?.audience ?? "all_users";
    // Prefer the live COUNT; fall back to the stored count (covers rows created before any
    // notification fan-out completed).
    const recipientCount = Number(row.actual_count) || Number(row.stored_count) || 0;
    return mapAnnouncementRow(
      row.id,
      {
        title: row.title,
        body: row.body,
        category: String(row.category ?? "system"),
        audience,
        sendAt: meta?.sendAt ?? "",
        popupEnabled: meta?.popupEnabled ?? false,
        maxImpressions: meta?.maxImpressions ?? 0,
      },
      recipientCount,
      String(row.created_at ?? ""),
      meta ?? undefined,
    );
  });

  // Merge in announcements that are SCHEDULED but not yet sent. These live in
  // scheduled_announcements (no notification rows exist yet), so without this they'd be invisible
  // in the admin list and look like the create silently failed. Marked scheduled=true so the UI
  // can distinguish "will send at" from already-delivered.
  const scheduled = await db
    .prepare(
      `SELECT announcement_id, title, body, category, audience, popup_enabled, max_impressions, send_at, created_at
       FROM scheduled_announcements WHERE sent = 0 ORDER BY send_at ASC LIMIT 200`,
    )
    .all<{
      announcement_id: string;
      title: string;
      body: string;
      category: string;
      audience: string;
      popup_enabled: number;
      max_impressions: number;
      send_at: string;
      created_at: string;
    }>();

  const scheduledItems = scheduled.results.map((row) => ({
    ...mapAnnouncementRow(
      row.announcement_id,
      {
        title: row.title,
        body: row.body,
        category: row.category,
        audience: row.audience as AnnouncementAudience,
        sendAt: row.send_at,
        popupEnabled: row.popup_enabled === 1,
        maxImpressions: row.max_impressions,
      },
      0,
      row.created_at,
    ),
    scheduled: true,
  }));

  // Show the soonest-to-send scheduled ones first, then the already-sent history.
  items = [...scheduledItems, ...items];

  if (opts.category && opts.category !== "all") {
    items = items.filter((n) => n.category === opts.category);
  }
  if (opts.active === "active") items = items.filter((n) => n.active);
  if (opts.active === "inactive") items = items.filter((n) => !n.active);
  if (opts.search?.trim()) {
    const q = opts.search.trim().toLowerCase();
    items = items.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.body.toLowerCase().includes(q) ||
        n.recipientScope.toLowerCase().includes(q),
    );
  }

  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, opts.pageSize ?? 10));
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;

  return {
    items: items.slice(start, start + pageSize),
    total,
    page,
    pageSize,
    totalPages,
  };
}

export async function updateAnnouncement(
  db: D1Database,
  announcementId: string,
  patch: Partial<AnnouncementInput> & { active?: boolean },
) {
  const { results } = await db
    .prepare(`SELECT id, metadata FROM notifications WHERE type = 'announcement'`)
    .all<{ id: string; metadata: string | null }>();

  const targetIds = results
    .filter((r) => parseMetadata(r.metadata)?.announcementId === announcementId)
    .map((r) => r.id);

  // The master row (announcements) may exist even when notification rows don't yet, and vice versa.
  const masterRow = await db
    .prepare(`SELECT metadata FROM announcements WHERE id = ?`)
    .bind(announcementId)
    .first<{ metadata: string | null }>();

  if (!targetIds.length && !masterRow) throw new Error("Announcement not found");

  let syncedMeta: AnnouncementMetadata | null = null;

  for (const rowId of targetIds) {
    const row = results.find((r) => r.id === rowId);
    const meta = parseMetadata(row?.metadata);
    if (!meta) continue;

    const nextMeta: AnnouncementMetadata = {
      ...meta,
      ...(patch.audience !== undefined ? { audience: patch.audience } : {}),
      ...(patch.popupEnabled !== undefined ? { popupEnabled: patch.popupEnabled } : {}),
      ...(patch.maxImpressions !== undefined ? { maxImpressions: patch.maxImpressions } : {}),
      ...(patch.sendAt !== undefined ? { sendAt: patch.sendAt } : {}),
      ...(patch.active !== undefined ? { active: patch.active } : {}),
    };
    syncedMeta = nextMeta;

    await db
      .prepare(
        `UPDATE notifications SET
          title = COALESCE(?, title),
          body = COALESCE(?, body),
          category = COALESCE(?, category),
          metadata = ?
         WHERE id = ?`,
      )
      .bind(
        patch.title ?? null,
        patch.body ?? null,
        patch.category ?? null,
        JSON.stringify(nextMeta),
        rowId,
      )
      .run();
  }

  // Keep the announcements master row in sync so the paginated admin list reflects the edit.
  if (masterRow) {
    const baseMeta = syncedMeta ?? parseMetadata(masterRow.metadata);
    const nextMeta = baseMeta
      ? {
          ...baseMeta,
          ...(patch.audience !== undefined ? { audience: patch.audience } : {}),
          ...(patch.popupEnabled !== undefined ? { popupEnabled: patch.popupEnabled } : {}),
          ...(patch.maxImpressions !== undefined ? { maxImpressions: patch.maxImpressions } : {}),
          ...(patch.sendAt !== undefined ? { sendAt: patch.sendAt } : {}),
          ...(patch.active !== undefined ? { active: patch.active } : {}),
        }
      : null;
    await db
      .prepare(
        `UPDATE announcements SET
          title = COALESCE(?, title),
          body = COALESCE(?, body),
          category = COALESCE(?, category),
          metadata = COALESCE(?, metadata)
         WHERE id = ?`,
      )
      .bind(
        patch.title ?? null,
        patch.body ?? null,
        patch.category ?? null,
        nextMeta ? JSON.stringify(nextMeta) : null,
        announcementId,
      )
      .run();
  }

  const listed = await listAnnouncements(db, { page: 1, pageSize: 500 });
  return listed.items.find((n) => n.id === announcementId) ?? null;
}

export async function deleteAnnouncement(db: D1Database, announcementId: string) {
  const { results } = await db
    .prepare(`SELECT id, metadata FROM notifications WHERE type = 'announcement'`)
    .all<{ id: string; metadata: string | null }>();

  const targetIds = results
    .filter((r) => parseMetadata(r.metadata)?.announcementId === announcementId)
    .map((r) => r.id);

  // Also remove the master row (if present) so the announcement leaves the paginated list. Not all
  // announcements have a master row (scheduled-only ones live in scheduled_announcements), so a
  // missing row here is fine. Allow deleting a master row even when there are no notification rows.
  await db.prepare(`DELETE FROM announcements WHERE id = ?`).bind(announcementId).run();

  if (!targetIds.length) {
    // Nothing fanned out yet (e.g. scheduled-only) — the master delete above is sufficient.
    return;
  }

  for (const rowId of targetIds) {
    await db.prepare(`DELETE FROM notifications WHERE id = ?`).bind(rowId).run();
  }
}

function mapAnnouncementRow(
  announcementId: string,
  input: AnnouncementInput,
  recipientCount: number,
  createdAt: string,
  metadata?: AnnouncementMetadata,
) {
  const meta = metadata ?? {
    announcementId,
    audience: input.audience,
    popupEnabled: input.popupEnabled,
    maxImpressions: input.maxImpressions,
    impressionCount: 0,
    active: true,
    sendAt: input.sendAt,
  };

  return {
    id: announcementId,
    category: input.category,
    title: input.title,
    body: input.body,
    audience: meta.audience,
    recipientScope: `${AUDIENCE_LABELS[meta.audience]} (${recipientCount})`,
    read: false,
    active: meta.active,
    sendAt: meta.sendAt,
    popupEnabled: meta.popupEnabled,
    maxImpressions: meta.maxImpressions,
    impressionCount: meta.impressionCount,
    createdAt: formatInLabel(createdAt),
    recipientCount,
  };
}

export { AUDIENCE_LABELS };
