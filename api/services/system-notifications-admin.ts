import { createNotificationsBatch } from "./notifications";
import { id, nowIso, formatInLabel } from "../utils";

export type AnnouncementAudience =
  | "all_dealers"
  | "all_distributors"
  | "dealers_and_distributors"
  | "all_users"
  | "dealers"
  | "distributors"
  | "admin_staff";

export type AnnouncementInput = {
  title: string;
  body: string;
  category: string;
  /** Legacy single audience. Kept for back-compat; `audiences` (multi-select) takes precedence. */
  audience?: AnnouncementAudience;
  /** Multi-select audiences. The recipient set is the UNION of all selected audiences. */
  audiences?: AnnouncementAudience[];
  sendAt: string;
  popupEnabled: boolean;
  /** Legacy lifetime impression cap. */
  maxImpressions: number;
  /** How many times per day the in-app pop-up may show, per user. Defaults to 1. */
  popupMaxPerDay?: number;
};

const AUDIENCE_LABELS: Record<AnnouncementAudience, string> = {
  all_dealers: "All dealers",
  all_distributors: "All distributors",
  dealers_and_distributors: "Dealers + Distributors",
  all_users: "Everyone",
  dealers: "Dealers",
  distributors: "Distributors",
  admin_staff: "Admin staff",
};

/** Normalize an input's audience(s) into a de-duped array (multi-select first, legacy fallback). */
function resolveAudienceList(input: {
  audiences?: AnnouncementAudience[];
  audience?: AnnouncementAudience;
}): AnnouncementAudience[] {
  const list =
    Array.isArray(input.audiences) && input.audiences.length
      ? input.audiences
      : input.audience
        ? [input.audience]
        : [];
  return Array.from(new Set(list.filter(Boolean))) as AnnouncementAudience[];
}

/** Human label for one or more audiences. */
function audienceLabel(audiences: AnnouncementAudience[]): string {
  if (!audiences.length) return "Everyone";
  return audiences.map((a) => AUDIENCE_LABELS[a] ?? a).join(", ");
}

type AnnouncementMetadata = {
  announcementId: string;
  audience: AnnouncementAudience;
  /** Full multi-select audience list (union). Falls back to [audience] for legacy rows. */
  audiences?: AnnouncementAudience[];
  popupEnabled: boolean;
  maxImpressions: number;
  /** Per-user per-day pop-up cap. */
  popupMaxPerDay?: number;
  impressionCount: number;
  active: boolean;
  sendAt: string;
  /** The send event this fan-out belongs to (Template -> Send Event -> recipients). */
  sendEventId?: string;
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

/** Map an audience to the set of user roles it targets. Empty set (all_users) => everyone. */
function rolesForAudience(audience: AnnouncementAudience): string[] | null {
  switch (audience) {
    case "all_dealers":
    case "dealers":
      return ["dealer"];
    case "all_distributors":
    case "distributors":
      return ["distributor"];
    case "dealers_and_distributors":
      return ["dealer", "distributor"];
    case "admin_staff":
      return ["admin_staff", "master_admin"];
    case "all_users":
    default:
      return null; // null = no role filter (everyone)
  }
}

/**
 * Resolve the de-duplicated UNION of users across one or more audiences (multi-select). A user who
 * matches several selected audiences is included exactly once.
 */
async function resolveAudienceUsers(
  db: D1Database,
  audiences: AnnouncementAudience[],
): Promise<Array<{ id: string; role: string }>> {
  const list = audiences.length ? audiences : (["all_users"] as AnnouncementAudience[]);
  // "Everyone" (null role filter) subsumes every other audience — resolve once.
  const roleSet = new Set<string>();
  let everyone = false;
  for (const a of list) {
    const roles = rolesForAudience(a);
    if (roles === null) {
      everyone = true;
      break;
    }
    for (const r of roles) roleSet.add(r);
  }

  let sql = `SELECT id, role FROM users WHERE deleted_at IS NULL AND status = 'active'`;
  const binds: unknown[] = [];
  if (!everyone) {
    const roles = [...roleSet];
    if (roles.length === 0) return [];
    sql += ` AND role IN (${roles.map(() => "?").join(",")})`;
    binds.push(...roles);
  }
  const { results } = await db.prepare(sql).bind(...binds).all<{ id: string; role: string }>();
  // De-dupe by user id (a single query already returns distinct users, but be safe).
  const seen = new Set<string>();
  return results.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
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
/**
 * Fan out ONE send event to its audience RIGHT NOW.
 *
 * Template -> Send Event -> per-recipient: `announcementId` is the reusable TEMPLATE; `sendEventId`
 * is this specific Send / Send-Again. Each per-recipient notification row carries BOTH ids, so a
 * re-send creates fresh rows tagged with a new sendEventId while prior sends' history is untouched.
 *
 * Idempotent: if notification rows already exist for this sendEventId (e.g. the cron re-ran or the
 * request was retried), the fan-out is skipped so nobody is double-delivered.
 */
async function fanOutSendEvent(
  db: D1Database,
  announcementId: string,
  sendEventId: string,
  input: AnnouncementInput,
): Promise<number> {
  // Idempotency guard: never fan out the same send event twice.
  const existing = await db
    .prepare(`SELECT COUNT(*) AS c FROM notifications WHERE send_event_id = ?`)
    .bind(sendEventId)
    .first<{ c: number }>();
  if ((existing?.c ?? 0) > 0) return existing!.c;

  const audiences = resolveAudienceList(input);
  const recipients = await resolveAudienceUsers(db, audiences);
  if (!recipients.length) throw new Error("No recipients found for this audience");

  const popupMaxPerDay = Math.max(1, Math.floor(Number(input.popupMaxPerDay ?? 1)) || 1);
  const metadata: AnnouncementMetadata = {
    announcementId,
    audience: audiences[0] ?? "all_users",
    audiences,
    popupEnabled: input.popupEnabled,
    maxImpressions: input.maxImpressions,
    popupMaxPerDay,
    impressionCount: 0,
    active: true,
    sendAt: input.sendAt,
    sendEventId,
  };

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
      sendEventId,
    })),
  );

  // Record the delivered count on the send event.
  await db
    .prepare(`UPDATE notification_send_events SET recipient_count = ?, status = 'sent', sent_at = ? WHERE id = ?`)
    .bind(recipients.length, nowIso(), sendEventId)
    .run();

  return recipients.length;
}

/**
 * Upsert the reusable TEMPLATE (announcements row) — its saved audiences/popup settings drive future
 * Send-Again actions — WITHOUT fanning out. The template's metadata mirrors the latest send config.
 */
async function upsertTemplate(
  db: D1Database,
  announcementId: string,
  input: AnnouncementInput,
  recipientCount: number,
): Promise<AnnouncementMetadata> {
  const audiences = resolveAudienceList(input);
  const metadata: AnnouncementMetadata = {
    announcementId,
    audience: audiences[0] ?? "all_users",
    audiences,
    popupEnabled: input.popupEnabled,
    maxImpressions: input.maxImpressions,
    popupMaxPerDay: Math.max(1, Math.floor(Number(input.popupMaxPerDay ?? 1)) || 1),
    impressionCount: 0,
    active: true,
    sendAt: input.sendAt,
  };
  await db
    .prepare(
      `INSERT OR REPLACE INTO announcements (id, title, body, category, metadata, recipient_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM announcements WHERE id = ?), ?))`,
    )
    .bind(
      announcementId,
      input.title,
      input.body,
      input.category,
      JSON.stringify(metadata),
      recipientCount,
      announcementId,
      nowIso(),
    )
    .run();
  return metadata;
}

/** Create a SEND EVENT row (one per Send / Send-Again). status='sent' for immediate, else 'scheduled'. */
async function createSendEventRow(
  db: D1Database,
  templateId: string,
  input: AnnouncementInput,
  opts: { sendAtIso: string; status: "scheduled" | "sent"; createdBy?: string },
): Promise<string> {
  const sendEventId = id("nse");
  const audiences = resolveAudienceList(input);
  await db
    .prepare(
      `INSERT INTO notification_send_events
        (id, template_id, title, body, category, audiences, popup_enabled, popup_max_per_day, send_at, status, sent_at, recipient_count, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?, ?)`,
    )
    .bind(
      sendEventId,
      templateId,
      input.title,
      input.body,
      input.category,
      JSON.stringify(audiences),
      input.popupEnabled ? 1 : 0,
      Math.max(1, Math.floor(Number(input.popupMaxPerDay ?? 1)) || 1),
      opts.sendAtIso,
      opts.status,
      opts.createdBy ?? null,
      nowIso(),
    )
    .run();
  return sendEventId;
}

/**
 * Send a template's content to its audience NOW: ensure the template exists, create a send event,
 * and fan out. Shared by createAnnouncement (immediate), resendAnnouncement, and the cron.
 */
async function sendAnnouncementNow(
  db: D1Database,
  announcementId: string,
  input: AnnouncementInput,
  sendEventId?: string,
): Promise<number> {
  // Validate recipients up-front (clear error before creating a send event).
  const audiences = resolveAudienceList(input);
  const recipients = await resolveAudienceUsers(db, audiences);
  if (!recipients.length) throw new Error("No recipients found for this audience");

  await upsertTemplate(db, announcementId, input, recipients.length);
  const eventId =
    sendEventId ??
    (await createSendEventRow(db, announcementId, input, {
      sendAtIso: normalizeSendAt(input.sendAt) ?? nowIso(),
      status: "sent",
    }));
  return fanOutSendEvent(db, announcementId, eventId, input);
}

export async function createAnnouncement(db: D1Database, input: AnnouncementInput) {
  const announcementId = id("ann");

  // Scheduled for later: persist the definition and let the cron dispatch it when due. We still
  // validate the audience up-front so the admin gets immediate feedback if there are no recipients.
  const audiences = resolveAudienceList(input);
  if (isFutureSendAt(input.sendAt)) {
    const recipients = await resolveAudienceUsers(db, audiences);
    if (!recipients.length) throw new Error("No recipients found for this audience");

    // Store the reusable TEMPLATE now (so it appears in the list + is available for Send-Again),
    // and a SCHEDULED send event the cron will dispatch when due. Nothing is delivered yet.
    const sendAtIso = normalizeSendAt(input.sendAt) ?? input.sendAt;
    await upsertTemplate(db, announcementId, { ...input, sendAt: sendAtIso }, recipients.length);
    await createSendEventRow(db, announcementId, { ...input, sendAt: sendAtIso }, {
      sendAtIso,
      status: "scheduled",
    });

    return mapAnnouncementRow(
      announcementId,
      { ...input, sendAt: sendAtIso },
      recipients.length,
      nowIso(),
    );
  }

  // sendAt is now/past (or unparseable): deliver immediately.
  const recipientCount = await sendAnnouncementNow(db, announcementId, input);
  return mapAnnouncementRow(announcementId, input, recipientCount, nowIso());
}

/**
 * Send-Again: create a NEW send event for an existing TEMPLATE and either dispatch now or schedule.
 * Reuses the template's saved audiences/popup settings unless the caller overrides them. Does NOT
 * modify the template or any prior send's history — each send is independent (own send event id +
 * its own per-recipient notification rows).
 */
export async function resendAnnouncement(
  db: D1Database,
  templateId: string,
  opts: {
    mode?: "now" | "schedule";
    sendAt?: string;
    audiences?: AnnouncementAudience[];
    popupMaxPerDay?: number;
  } = {},
) {
  const master = await db
    .prepare(`SELECT id, title, body, category, metadata FROM announcements WHERE id = ?`)
    .bind(templateId)
    .first<{ id: string; title: string; body: string; category: string | null; metadata: string | null }>();
  if (!master) throw new Error("Notification not found");

  const meta = parseMetadata(master.metadata);
  const savedAudiences =
    meta?.audiences && meta.audiences.length
      ? meta.audiences
      : meta?.audience
        ? [meta.audience]
        : (["all_users"] as AnnouncementAudience[]);

  const input: AnnouncementInput = {
    title: master.title,
    body: master.body,
    category: String(master.category ?? "system"),
    audiences: opts.audiences && opts.audiences.length ? opts.audiences : savedAudiences,
    popupEnabled: meta?.popupEnabled ?? false,
    maxImpressions: meta?.maxImpressions ?? 1,
    popupMaxPerDay: opts.popupMaxPerDay ?? meta?.popupMaxPerDay ?? 1,
    sendAt: opts.sendAt ?? nowIso(),
  };

  if (opts.mode === "schedule" && opts.sendAt && isFutureSendAt(opts.sendAt)) {
    const sendAtIso = normalizeSendAt(opts.sendAt) ?? opts.sendAt;
    const eventId = await createSendEventRow(db, templateId, { ...input, sendAt: sendAtIso }, {
      sendAtIso,
      status: "scheduled",
    });
    return { templateId, sendEventId: eventId, status: "scheduled" as const, sendAt: sendAtIso };
  }

  // Send now: create a send event + fan out immediately.
  const eventId = await createSendEventRow(db, templateId, input, {
    sendAtIso: nowIso(),
    status: "sent",
  });
  const recipientCount = await fanOutSendEvent(db, templateId, eventId, input);
  return { templateId, sendEventId: eventId, status: "sent" as const, recipientCount };
}

/**
 * Cron step: deliver any scheduled announcements whose send_at has arrived and that haven't been
 * sent yet, then mark them sent. Runs on the every-15-minutes cron (see wrangler.toml), so a
 * scheduled time fires within ~15 min of the requested minute. Each row is marked sent even if
 * delivery throws,
 * to avoid an unbounded retry storm; failures are logged.
 */
export async function dispatchScheduledAnnouncements(db: D1Database): Promise<number> {
  let dispatched = 0;

  // NEW model: due scheduled SEND EVENTS. fanOutSendEvent is idempotent (skips if already fanned
  // out for this send event id), so marking status='sent' + a retry can never double-deliver.
  const { results: events } = await db
    .prepare(
      `SELECT id, template_id, title, body, category, audiences, popup_enabled, popup_max_per_day, send_at
       FROM notification_send_events
       WHERE status = 'scheduled' AND send_at <= ?
       ORDER BY send_at ASC LIMIT 100`,
    )
    .bind(nowIso())
    .all<{
      id: string;
      template_id: string;
      title: string;
      body: string;
      category: string;
      audiences: string | null;
      popup_enabled: number;
      popup_max_per_day: number;
      send_at: string;
    }>();

  for (const row of events) {
    let audiences: AnnouncementAudience[] = [];
    try {
      audiences = JSON.parse(row.audiences ?? "[]") as AnnouncementAudience[];
    } catch {
      audiences = [];
    }
    const input: AnnouncementInput = {
      title: row.title,
      body: row.body,
      category: row.category,
      audiences,
      sendAt: row.send_at,
      popupEnabled: row.popup_enabled === 1,
      maxImpressions: 1,
      popupMaxPerDay: row.popup_max_per_day,
    };
    try {
      await fanOutSendEvent(db, row.template_id, row.id, input);
      dispatched += 1;
    } catch (err) {
      console.error(
        `[cron] dispatchScheduledAnnouncements: send event ${row.id} failed:`,
        err instanceof Error ? err.message : err,
      );
      // Mark sent so a persistent failure (e.g. audience now empty) doesn't re-fire forever.
      await db
        .prepare(`UPDATE notification_send_events SET status = 'sent', sent_at = ? WHERE id = ?`)
        .bind(nowIso(), row.id)
        .run();
    }
  }

  // LEGACY back-compat: dispatch any pre-existing scheduled_announcements rows (created before the
  // send-event model) so nothing scheduled under the old system is silently dropped.
  const { results } = await db
    .prepare(
      `SELECT id, announcement_id, title, body, category, audience, popup_enabled, max_impressions, send_at
       FROM scheduled_announcements
       WHERE sent = 0 AND send_at <= ?
       ORDER BY send_at ASC LIMIT 100`,
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
        `[cron] dispatchScheduledAnnouncements (legacy): failed to send ${row.announcement_id}:`,
        err instanceof Error ? err.message : err,
      );
    }
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

  // Attach each template's SEND EVENT history (Template -> Send Event -> recipients), so the UI can
  // show "sent 3 times" with per-send audience/time/count, and a pending scheduled send.
  const templateIds = items.map((it) => it.id);
  const sendEventsByTemplate = new Map<
    string,
    Array<{ id: string; audiences: AnnouncementAudience[]; status: string; sendAt: string; sentAt: string | null; recipientCount: number }>
  >();
  if (templateIds.length) {
    const ph = templateIds.map(() => "?").join(",");
    const { results: evRows } = await db
      .prepare(
        `SELECT id, template_id, audiences, status, send_at, sent_at, recipient_count
         FROM notification_send_events WHERE template_id IN (${ph})
         ORDER BY created_at DESC`,
      )
      .bind(...templateIds)
      .all<{
        id: string;
        template_id: string;
        audiences: string | null;
        status: string;
        send_at: string;
        sent_at: string | null;
        recipient_count: number;
      }>();
    for (const ev of evRows) {
      let auds: AnnouncementAudience[] = [];
      try {
        auds = JSON.parse(ev.audiences ?? "[]") as AnnouncementAudience[];
      } catch {
        auds = [];
      }
      const list = sendEventsByTemplate.get(ev.template_id) ?? [];
      list.push({
        id: ev.id,
        audiences: auds,
        status: ev.status,
        sendAt: ev.send_at,
        sentAt: ev.sent_at ? formatInLabel(ev.sent_at) : null,
        recipientCount: ev.recipient_count,
      });
      sendEventsByTemplate.set(ev.template_id, list);
    }
  }
  items = items.map((it) => {
    const events = sendEventsByTemplate.get(it.id) ?? [];
    const scheduledPending = events.find((e) => e.status === "scheduled");
    return {
      ...it,
      sendEvents: events,
      sendCount: events.filter((e) => e.status === "sent").length,
      scheduled: Boolean(scheduledPending),
      nextSendAt: scheduledPending ? scheduledPending.sendAt : null,
    };
  });

  // LEGACY back-compat: also surface pre-existing scheduled_announcements rows (created before the
  // send-event model) that have no template row yet.
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

  const knownIds = new Set(items.map((it) => it.id));
  const scheduledItems = scheduled.results
    .filter((row) => !knownIds.has(row.announcement_id))
    .map((row) => ({
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

  // Also remove the master/template row so the notification leaves the list, plus its send events
  // (Template -> Send Event) and any legacy scheduled row. Deleting the template removes all of its
  // sends and their delivered history (the admin explicitly deleted the notification).
  await db.prepare(`DELETE FROM announcements WHERE id = ?`).bind(announcementId).run();
  await db.prepare(`DELETE FROM notification_send_events WHERE template_id = ?`).bind(announcementId).run();
  await db.prepare(`DELETE FROM scheduled_announcements WHERE announcement_id = ?`).bind(announcementId).run();
  // Remove per-recipient rows for this template's sends (matched by announcement_id = template id).
  await db.prepare(`DELETE FROM notifications WHERE announcement_id = ?`).bind(announcementId).run();

  // Fallback: also drop any legacy rows matched only via metadata.announcementId.
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
  const inputAudiences = resolveAudienceList(input);
  const meta = metadata ?? {
    announcementId,
    audience: inputAudiences[0] ?? "all_users",
    audiences: inputAudiences,
    popupEnabled: input.popupEnabled,
    maxImpressions: input.maxImpressions,
    popupMaxPerDay: input.popupMaxPerDay ?? 1,
    impressionCount: 0,
    active: true,
    sendAt: input.sendAt,
  };
  const audiences =
    meta.audiences && meta.audiences.length ? meta.audiences : [meta.audience];

  return {
    id: announcementId,
    category: input.category,
    title: input.title,
    body: input.body,
    audience: meta.audience,
    audiences,
    recipientScope: `${audienceLabel(audiences)} (${recipientCount})`,
    read: false,
    active: meta.active,
    sendAt: meta.sendAt,
    popupEnabled: meta.popupEnabled,
    maxImpressions: meta.maxImpressions,
    popupMaxPerDay: meta.popupMaxPerDay ?? 1,
    impressionCount: meta.impressionCount,
    createdAt: formatInLabel(createdAt),
    recipientCount,
  };
}

export { AUDIENCE_LABELS };
