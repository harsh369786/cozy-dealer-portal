import { formatInLabel, id, nowIso } from "../utils";
import { writeAuditLog } from "./audit";
import { notifySalesExecutive, notifyUser } from "./notification-events";

export type SignupReviewFilters = {
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
};

export type ApproveSignupInput = {
  action: "approve";
  role: "dealer" | "distributor" | "sales_executive" | "admin_staff";
  distributorId?: string | null;
  salesExecutiveUserId?: string | null;
};

export type RejectSignupInput = {
  action: "reject";
  note?: string | null;
};

const APPROVE_ROLES = new Set(["dealer", "distributor", "sales_executive", "admin_staff"]);

function mapSignupRow(r: Record<string, unknown>) {
  return {
    id: r.id as string,
    userId: (r.user_id as string) ?? null,
    name: r.name as string,
    birthday: r.birthday as string,
    storeName: r.store_name as string,
    phone: r.phone as string,
    address: r.address as string,
    gstNumber: (r.gst_number as string) ?? null,
    distributorName: r.distributor_name as string,
    status: r.status as string,
    reviewNote: (r.review_note as string) ?? null,
    createdAt: r.created_at as string,
    submittedAtLabel: formatInLabel((r.created_at as string) ?? nowIso()),
  };
}

async function validateDistributorId(db: D1Database, distributorId: string | null | undefined) {
  if (!distributorId) return;
  const row = await db
    .prepare(`SELECT id FROM distributors WHERE id = ? AND deleted_at IS NULL`)
    .bind(distributorId)
    .first();
  if (!row) throw new Error("Distributor not found");
}

async function validateSalesExecutiveId(db: D1Database, userId: string | null | undefined) {
  if (!userId) return;
  const row = await db
    .prepare(
      `SELECT id FROM users WHERE id = ? AND role = 'sales_executive' AND status = 'active' AND deleted_at IS NULL`,
    )
    .bind(userId)
    .first();
  if (!row) throw new Error("Sales executive not found");
}

function slugCode(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 12);
}

async function uniqueDealerCode(db: D1Database, storeName: string) {
  const base = slugCode(storeName) || "dealer";
  let code = base;
  let n = 1;
  while (true) {
    const row = await db.prepare(`SELECT id FROM dealers WHERE code = ?`).bind(code).first();
    if (!row) return code;
    n += 1;
    code = `${base}-${n}`;
  }
}

function locationFromAddress(address: string) {
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  return parts[parts.length - 1] ?? address.slice(0, 80);
}

export async function listSignupApplications(db: D1Database, filters: SignupReviewFilters = {}) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
  const offset = (page - 1) * pageSize;
  const status = filters.status && filters.status !== "all" ? filters.status : "pending";

  let sql = `SELECT * FROM signup_applications WHERE status = ?`;
  const binds: unknown[] = [status];

  if (filters.search?.trim()) {
    const q = `%${filters.search.trim()}%`;
    sql += ` AND (name LIKE ? OR store_name LIKE ? OR phone LIKE ? OR address LIKE ? OR distributor_name LIKE ?)`;
    binds.push(q, q, q, q, q);
  }

  let countSql = `SELECT COUNT(*) as c FROM signup_applications WHERE status = ?`;
  const countBinds: unknown[] = [status];
  if (filters.search?.trim()) {
    const q = `%${filters.search.trim()}%`;
    countSql += ` AND (name LIKE ? OR store_name LIKE ? OR phone LIKE ? OR address LIKE ? OR distributor_name LIKE ?)`;
    countBinds.push(q, q, q, q, q);
  }

  const countRow = await db.prepare(countSql).bind(...countBinds).first<{ c: number }>();

  sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  binds.push(pageSize, offset);

  const { results } = await db.prepare(sql).bind(...binds).all();
  const total = countRow?.c ?? 0;

  return {
    items: results.map(mapSignupRow),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function reviewSignupApplication(
  db: D1Database,
  applicationId: string,
  input: ApproveSignupInput | RejectSignupInput,
  actorUserId: string,
) {
  const app = await db
    .prepare(`SELECT * FROM signup_applications WHERE id = ?`)
    .bind(applicationId)
    .first<Record<string, unknown>>();

  if (!app) throw new Error("Signup application not found");
  if (app.status !== "pending") throw new Error("Signup application is no longer pending");

  const userId = app.user_id as string | null;
  if (!userId) throw new Error("Signup application is not linked to a user");

  const user = await db
    .prepare(`SELECT * FROM users WHERE id = ? AND deleted_at IS NULL`)
    .bind(userId)
    .first<Record<string, unknown>>();
  if (!user) throw new Error("Linked user not found");
  if (user.status !== "pending_approval") throw new Error("User is not pending approval");

  const ts = nowIso();

  if (input.action === "reject" && !input.note?.trim()) {
    throw new Error("Rejection reason is required");
  }

  if (input.action === "reject") {
    await db.batch([
      db
        .prepare(`UPDATE users SET status = 'rejected', updated_at = ? WHERE id = ?`)
        .bind(ts, userId),
      db
        .prepare(
          `UPDATE signup_applications SET status = 'rejected', reviewed_by = ?, review_note = ?, updated_at = ? WHERE id = ?`,
        )
        .bind(actorUserId, input.note ?? null, ts, applicationId),
      db.prepare(`DELETE FROM sessions WHERE user_id = ?`).bind(userId),
    ]);

    await writeAuditLog(db, {
      actorUserId,
      action: "signup.reject",
      entityType: "signup_application",
      entityId: applicationId,
      after: { status: "rejected", note: input.note ?? null },
    });

    await notifyUser(db, userId, {
      category: "system",
      type: "system",
      title: "Signup not approved",
      body: input.note?.trim()
        ? `Your signup request was not approved: ${input.note.trim()}`
        : "Your signup request was not approved. Contact support if you need help.",
      link: "/",
    });

    return { status: "rejected" as const };
  }

  if (!APPROVE_ROLES.has(input.role)) throw new Error("Invalid role for approval");

  let dealerId: string | null = null;
  let distributorId: string | null = null;

  if (input.role === "dealer") {
    if (!input.distributorId) throw new Error("Dealer approval requires a distributor");
    await validateDistributorId(db, input.distributorId);
    await validateSalesExecutiveId(db, input.salesExecutiveUserId ?? null);

    dealerId = id("dlr");
    const code = await uniqueDealerCode(db, app.store_name as string);
    const location = locationFromAddress(app.address as string);

    await db
      .prepare(
        `INSERT INTO dealers (
           id, distributor_id, sales_executive_user_id, code, store_name, contact_name,
           location, address, phone, gst_number, active, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .bind(
        dealerId,
        input.distributorId,
        input.salesExecutiveUserId ?? null,
        code,
        app.store_name,
        app.name,
        location,
        app.address,
        app.phone,
        app.gst_number ?? null,
        ts,
        ts,
      )
      .run();
  } else if (input.role === "distributor") {
    if (!input.distributorId) throw new Error("Distributor role requires distributorId");
    await validateDistributorId(db, input.distributorId);
    distributorId = input.distributorId;
  } else if (input.role === "sales_executive" || input.role === "admin_staff") {
    if (input.distributorId || input.salesExecutiveUserId) {
      throw new Error("Admin and sales roles cannot be assigned distributor or sales executive links");
    }
  }

  await db.batch([
    db
      .prepare(
        `UPDATE users SET role = ?, dealer_id = ?, distributor_id = ?, status = 'active', updated_at = ? WHERE id = ?`,
      )
      .bind(input.role, dealerId, distributorId, ts, userId),
    db
      .prepare(
        `UPDATE signup_applications SET status = 'approved', reviewed_by = ?, created_dealer_id = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(actorUserId, dealerId, ts, applicationId),
  ]);

  await writeAuditLog(db, {
    actorUserId,
    action: "signup.approve",
    entityType: "signup_application",
    entityId: applicationId,
    after: { status: "approved", role: input.role, dealerId, distributorId },
  });

  const postLoginPath =
    input.role === "dealer"
      ? "/home"
      : input.role === "distributor"
        ? "/distributor/dashboard"
        : input.role === "sales_executive"
          ? "/distributor/dashboard"
          : "/admin";

  await notifyUser(db, userId, {
    category: "system",
    type: "system",
    title: "Account approved",
    body: "Your signup has been approved. You can now use the portal.",
    link: postLoginPath,
  });

  if (input.role === "dealer" && dealerId && input.salesExecutiveUserId) {
    await notifySalesExecutive(db, input.salesExecutiveUserId, {
      category: "system",
      type: "system",
      title: "New dealer assigned",
      body: `${app.store_name as string} has been assigned to you`,
      link: `/distributor/dealers/${dealerId}`,
    });
  }

  return { status: "approved" as const, userId, dealerId };
}
