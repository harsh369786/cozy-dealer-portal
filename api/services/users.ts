import { formatInLabel, id, normalizePhone, nowIso } from "../utils";
import { writeAuditLog } from "./audit";
import { notifyUser } from "./notification-events";
import { enqueueWhatsapp } from "./whatsapp";

export type AdminUserRow = {
  id: string;
  name: string;
  phone: string;
  role: string;
  status: string;
  dealerId: string | null;
  dealerName: string | null;
  distributorId: string | null;
  distributorName: string | null;
  region: string | null;
  createdAt: string;
};

export type UserFilters = {
  search?: string;
  role?: string;
  status?: string;
  page?: number;
  pageSize?: number;
};

export type CreateUserInput = {
  name: string;
  phone: string;
  role: string;
  dealerId?: string | null;
  distributorId?: string | null;
  email?: string | null;
  sendWhatsAppInvite?: boolean;
};

type UserInviteOptions = {
  env?: { WHATSAPP_QUEUE?: Queue };
  portalBaseUrl?: string;
};

export type UpdateUserInput = {
  name?: string;
  phone?: string;
  role?: string;
  status?: "active" | "suspended";
  dealerId?: string | null;
  distributorId?: string | null;
  email?: string | null;
};

const USER_ROLES = new Set([
  "master_admin",
  "admin_staff",
  "distributor",
  "sales_executive",
  "dealer",
]);

function postLoginPathForRole(role: string) {
  if (role === "dealer") return "/home";
  if (role === "distributor" || role === "sales_executive") return "/distributor/dashboard";
  if (role === "master_admin" || role === "admin_staff") return "/admin";
  return "/";
}

function buildLoginUrl(role: string, portalBaseUrl?: string) {
  const loginPath = postLoginPathForRole(role);
  if (!portalBaseUrl) return loginPath;
  return `${portalBaseUrl.replace(/\/$/, "")}${loginPath}`;
}

async function sendUserInviteWhatsapp(
  db: D1Database,
  env: UserInviteOptions["env"],
  input: { phone: string; name: string; role: string; portalBaseUrl?: string },
) {
  const loginUrl = buildLoginUrl(input.role, input.portalBaseUrl);
  await enqueueWhatsapp(db, env ?? {}, {
    toPhone: input.phone,
    templateKey: "user_invite",
    payload: {
      name: input.name,
      loginUrl,
      loginPath: postLoginPathForRole(input.role),
    },
  });
}

function mapUserRow(r: Record<string, unknown>): AdminUserRow {
  return {
    id: r.id as string,
    name: r.name as string,
    phone: r.phone as string,
    role: r.role as string,
    status: r.status as string,
    dealerId: (r.dealer_id as string) ?? null,
    dealerName: (r.dealer_name as string) ?? null,
    distributorId: (r.distributor_id as string) ?? null,
    distributorName: (r.distributor_name as string) ?? null,
    region: (r.region as string) ?? null,
    createdAt: formatInLabel((r.created_at as string) ?? nowIso()),
  };
}

const USER_SELECT = `
  SELECT u.*,
         d.store_name as dealer_name,
         dist.name as distributor_name,
         dist.region as region
  FROM users u
  LEFT JOIN dealers d ON d.id = u.dealer_id
  LEFT JOIN distributors dist ON dist.id = u.distributor_id`;

async function validateDealerId(db: D1Database, dealerId: string | null | undefined) {
  if (dealerId === undefined || dealerId === null) return;
  const row = await db
    .prepare(`SELECT id FROM dealers WHERE id = ? AND deleted_at IS NULL`)
    .bind(dealerId)
    .first();
  if (!row) throw new Error("Dealer not found");
}

async function validateDistributorId(db: D1Database, distributorId: string | null | undefined) {
  if (distributorId === undefined || distributorId === null) return;
  const row = await db
    .prepare(`SELECT id FROM distributors WHERE id = ? AND deleted_at IS NULL`)
    .bind(distributorId)
    .first();
  if (!row) throw new Error("Distributor not found");
}

function validateRoleLinks(role: string, dealerId: string | null, distributorId: string | null) {
  if (role === "dealer" && !dealerId) throw new Error("Dealer role requires dealerId");
  if (role === "distributor" && !distributorId) throw new Error("Distributor role requires distributorId");
  if (role === "master_admin" || role === "admin_staff" || role === "sales_executive") {
    if (dealerId) throw new Error("Admin and sales roles cannot be linked to a dealer");
    if (distributorId) throw new Error("Admin and sales roles cannot be linked to a distributor");
  }
}

export async function listAdminUsers(db: D1Database, filters: UserFilters = {}) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
  const offset = (page - 1) * pageSize;

  let sql = `${USER_SELECT} WHERE u.deleted_at IS NULL`;
  const binds: unknown[] = [];

  if (filters.role && filters.role !== "all") {
    sql += ` AND u.role = ?`;
    binds.push(filters.role);
  }
  if (filters.status && filters.status !== "all") {
    sql += ` AND u.status = ?`;
    binds.push(filters.status);
  }
  if (filters.search?.trim()) {
    const q = `%${filters.search.trim()}%`;
    sql += ` AND (u.name LIKE ? OR u.phone LIKE ? OR d.store_name LIKE ? OR dist.name LIKE ?)`;
    binds.push(q, q, q, q);
  }

  let countSql = `SELECT COUNT(*) as c FROM users u
    LEFT JOIN dealers d ON d.id = u.dealer_id
    LEFT JOIN distributors dist ON dist.id = u.distributor_id
    WHERE u.deleted_at IS NULL`;
  const countBinds: unknown[] = [];
  if (filters.role && filters.role !== "all") {
    countSql += ` AND u.role = ?`;
    countBinds.push(filters.role);
  }
  if (filters.status && filters.status !== "all") {
    countSql += ` AND u.status = ?`;
    countBinds.push(filters.status);
  }
  if (filters.search?.trim()) {
    const q = `%${filters.search.trim()}%`;
    countSql += ` AND (u.name LIKE ? OR u.phone LIKE ? OR d.store_name LIKE ? OR dist.name LIKE ?)`;
    countBinds.push(q, q, q, q);
  }

  const countRow = await db.prepare(countSql).bind(...countBinds).first<{ c: number }>();

  sql += ` ORDER BY u.created_at DESC LIMIT ? OFFSET ?`;
  binds.push(pageSize, offset);

  const { results } = await db.prepare(sql).bind(...binds).all();
  const total = countRow?.c ?? 0;

  return {
    items: results.map(mapUserRow),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getAdminUser(db: D1Database, userId: string) {
  const row = await db
    .prepare(`${USER_SELECT} WHERE u.id = ? AND u.deleted_at IS NULL`)
    .bind(userId)
    .first<Record<string, unknown>>();
  return row ? mapUserRow(row) : null;
}

export async function getUserCreateOptions(db: D1Database) {
  const { results: dealers } = await db
    .prepare(
      `SELECT id, store_name as name, code
       FROM dealers
       WHERE deleted_at IS NULL
       ORDER BY store_name`,
    )
    .all<{ id: string; name: string; code: string }>();

  const { results: distributors } = await db
    .prepare(`SELECT id, name, region FROM distributors WHERE deleted_at IS NULL ORDER BY name`)
    .all<{ id: string; name: string; region: string }>();

  return { dealers, distributors };
}

function assertActorCanAssignRole(actorRole: string, targetRole: string) {
  if (actorRole === "admin_staff" && targetRole === "master_admin") {
    throw new Error("Forbidden: cannot assign master admin role");
  }
}

export async function createAdminUser(
  db: D1Database,
  input: CreateUserInput,
  actorUserId: string,
  actorRole?: string,
  opts: UserInviteOptions = {},
) {
  const phone = normalizePhone(input.phone);
  if (!input.name?.trim()) throw new Error("Name is required");
  if (!USER_ROLES.has(input.role)) throw new Error("Invalid role");
  if (actorRole) assertActorCanAssignRole(actorRole, input.role);

  const existing = await db.prepare(`SELECT id FROM users WHERE phone = ?`).bind(phone).first();
  if (existing) throw new Error("Phone number already registered");

  const dealerId = input.dealerId ?? null;
  const distributorId = input.distributorId ?? null;
  validateRoleLinks(input.role, dealerId, distributorId);
  await validateDealerId(db, dealerId);
  await validateDistributorId(db, distributorId);

  const userId = id("user");
  const ts = nowIso();
  await db
    .prepare(
      `INSERT INTO users (id, phone, name, email, role, dealer_id, distributor_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    )
    .bind(
      userId,
      phone,
      input.name.trim(),
      input.email ?? null,
      input.role,
      dealerId,
      distributorId,
      ts,
      ts,
    )
    .run();

  const created = await getAdminUser(db, userId);
  await writeAuditLog(db, {
    actorUserId,
    action: "user.create",
    entityType: "user",
    entityId: userId,
    after: created,
  });

  await notifyUser(db, userId, {
    category: "system",
    type: "system",
    title: "Welcome to BackRest",
    body: "Your account is ready. Sign in with your registered phone number.",
    link: postLoginPathForRole(input.role),
  });

  let invitedAt: string | undefined;
  if (input.sendWhatsAppInvite) {
    await sendUserInviteWhatsapp(db, opts.env, {
      phone,
      name: input.name.trim(),
      role: input.role,
      portalBaseUrl: opts.portalBaseUrl,
    });
    invitedAt = formatInLabel(ts);
    await writeAuditLog(db, {
      actorUserId,
      action: "user.invite.whatsapp",
      entityType: "user",
      entityId: userId,
      after: { phone, invitedAt },
    });
  }

  return {
    ...created!,
    ...(input.sendWhatsAppInvite
      ? { inviteSentVia: "whatsapp" as const, invitedAt }
      : {}),
  };
}

export async function resendAdminUserInvite(
  db: D1Database,
  userId: string,
  actorUserId: string,
  opts: UserInviteOptions = {},
) {
  const user = await getAdminUser(db, userId);
  if (!user) throw new Error("User not found");

  const invitedAt = formatInLabel(nowIso());
  await sendUserInviteWhatsapp(db, opts.env, {
    phone: user.phone,
    name: user.name,
    role: user.role,
    portalBaseUrl: opts.portalBaseUrl,
  });

  await writeAuditLog(db, {
    actorUserId,
    action: "user.invite.whatsapp.resend",
    entityType: "user",
    entityId: userId,
    after: { phone: user.phone, invitedAt },
  });

  return { ok: true as const, invitedAt, inviteSentVia: "whatsapp" as const };
}

export async function updateAdminUser(
  db: D1Database,
  userId: string,
  patch: UpdateUserInput,
  actorUserId: string,
) {
  const before = await getAdminUser(db, userId);
  if (!before) throw new Error("User not found");

  if (patch.status === "suspended" && userId === actorUserId) {
    throw new Error("Cannot suspend your own account");
  }

  const nextRole = patch.role ?? before.role;
  const nextDealerId = patch.dealerId !== undefined ? patch.dealerId : before.dealerId;
  const nextDistributorId =
    patch.distributorId !== undefined ? patch.distributorId : before.distributorId;

  if (patch.role || patch.dealerId !== undefined || patch.distributorId !== undefined) {
    if (!USER_ROLES.has(nextRole)) throw new Error("Invalid role");
    validateRoleLinks(nextRole, nextDealerId, nextDistributorId);
    await validateDealerId(db, nextDealerId);
    await validateDistributorId(db, nextDistributorId);
  }

  const actor = await db
    .prepare(`SELECT role FROM users WHERE id = ?`)
    .bind(actorUserId)
    .first<{ role: string }>();
  if (actor && (patch.role || nextRole !== before.role)) {
    assertActorCanAssignRole(actor.role, nextRole);
  }

  if (patch.phone) {
    const phone = normalizePhone(patch.phone);
    const existing = await db
      .prepare(`SELECT id FROM users WHERE phone = ? AND id != ?`)
      .bind(phone, userId)
      .first();
    if (existing) throw new Error("Phone number already registered");
  }

  const sets: string[] = ["updated_at = ?"];
  const binds: unknown[] = [nowIso()];

  if (patch.name !== undefined) {
    sets.push("name = ?");
    binds.push(patch.name.trim());
  }
  if (patch.phone !== undefined) {
    sets.push("phone = ?");
    binds.push(normalizePhone(patch.phone));
  }
  if (patch.role !== undefined) {
    sets.push("role = ?");
    binds.push(patch.role);
  }
  if (patch.status !== undefined) {
    sets.push("status = ?");
    binds.push(patch.status);
  }
  if (patch.email !== undefined) {
    sets.push("email = ?");
    binds.push(patch.email);
  }
  if (patch.dealerId !== undefined) {
    sets.push("dealer_id = ?");
    binds.push(patch.dealerId);
  }
  if (patch.distributorId !== undefined) {
    sets.push("distributor_id = ?");
    binds.push(patch.distributorId);
  }

  if (sets.length === 1) throw new Error("No fields to update");

  binds.push(userId);
  await db.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ? AND deleted_at IS NULL`).bind(...binds).run();

  const after = await getAdminUser(db, userId);
  await writeAuditLog(db, {
    actorUserId,
    action: patch.status === "suspended" ? "user.suspend" : patch.status === "active" ? "user.activate" : "user.update",
    entityType: "user",
    entityId: userId,
    before,
    after,
  });

  if (patch.status === "suspended") {
    await notifyUser(db, userId, {
      category: "system",
      type: "system",
      title: "Account suspended",
      body: "Your portal access has been suspended. Contact support if you need help.",
      link: "/",
    });
  } else if (patch.status === "active" && before.status === "suspended") {
    await notifyUser(db, userId, {
      category: "system",
      type: "system",
      title: "Account reactivated",
      body: "Your portal access has been restored.",
      link: postLoginPathForRole(after!.role),
    });
  }

  return after!;
}

export async function softDeleteAdminUser(db: D1Database, userId: string, actorUserId: string) {
  if (userId === actorUserId) throw new Error("Cannot delete your own account");

  const before = await getAdminUser(db, userId);
  if (!before) throw new Error("User not found");

  const ts = nowIso();
  await db
    .prepare(`UPDATE users SET deleted_at = ?, status = 'suspended', updated_at = ? WHERE id = ?`)
    .bind(ts, ts, userId)
    .run();

  await writeAuditLog(db, {
    actorUserId,
    action: "user.delete",
    entityType: "user",
    entityId: userId,
    before,
    after: { deletedAt: ts },
  });
  return { ok: true };
}
