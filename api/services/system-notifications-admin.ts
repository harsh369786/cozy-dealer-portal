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

export async function createAnnouncement(db: D1Database, input: AnnouncementInput) {
  const recipients = await resolveAudienceUsers(db, input.audience);
  if (!recipients.length) throw new Error("No recipients found for this audience");

  const announcementId = id("ann");
  const metadata: AnnouncementMetadata = {
    announcementId,
    audience: input.audience,
    popupEnabled: input.popupEnabled,
    maxImpressions: input.maxImpressions,
    impressionCount: 0,
    active: true,
    sendAt: input.sendAt,
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
    })),
  );

  return mapAnnouncementRow(announcementId, input, recipients.length, nowIso());
}

export async function listAnnouncements(
  db: D1Database,
  opts: { search?: string; category?: string; active?: string; page?: number; pageSize?: number } = {},
) {
  const { results } = await db
    .prepare(
      `SELECT id, category, type, title, body, metadata, created_at
       FROM notifications WHERE type = 'announcement' ORDER BY created_at DESC LIMIT 500`,
    )
    .all<Record<string, unknown>>();

  const byAnnouncement = new Map<
    string,
    {
      id: string;
      category: string;
      title: string;
      body: string;
      metadata: AnnouncementMetadata;
      createdAt: string;
      recipientCount: number;
    }
  >();

  for (const row of results) {
    const meta = parseMetadata(row.metadata);
    if (!meta) continue;
    const existing = byAnnouncement.get(meta.announcementId);
    if (existing) {
      existing.recipientCount += 1;
      continue;
    }
    byAnnouncement.set(meta.announcementId, {
      id: meta.announcementId,
      category: String(row.category ?? "system"),
      title: String(row.title ?? ""),
      body: String(row.body ?? ""),
      metadata: meta,
      createdAt: String(row.created_at ?? ""),
      recipientCount: 1,
    });
  }

  let items = [...byAnnouncement.values()].map((row) => mapAnnouncementRow(
    row.id,
    {
      title: row.title,
      body: row.body,
      category: row.category,
      audience: row.metadata.audience,
      sendAt: row.metadata.sendAt,
      popupEnabled: row.metadata.popupEnabled,
      maxImpressions: row.metadata.maxImpressions,
    },
    row.recipientCount,
    row.createdAt,
    row.metadata,
  ));

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

  if (!targetIds.length) throw new Error("Announcement not found");

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

  if (!targetIds.length) throw new Error("Announcement not found");

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
