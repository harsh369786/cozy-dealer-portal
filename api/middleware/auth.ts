import type { Context, Next } from "hono";
import type { ApiEnv, AppVariables, SessionUser } from "../types";
import { buildSessionUser, hasPermission } from "../rbac";
import type { Permission } from "../types";
import { SESSION_COOKIE, sha256 } from "../utils";
import { getDatabase } from "../db/get-db";

export async function optionalAuth(c: Context<{ Bindings: ApiEnv; Variables: AppVariables }>, next: Next) {
  const sessionId = getSessionCookie(c);
  if (sessionId) {
    const user = await resolveSession(c.env, sessionId);
    if (user) {
      c.set("user", user);
      c.set("sessionId", sessionId);
    }
  }
  await next();
}

export async function requireAuth(c: Context<{ Bindings: ApiEnv; Variables: AppVariables }>, next: Next) {
  const sessionId = getSessionCookie(c);
  if (!sessionId) return c.json({ error: "Unauthorized" }, 401);
  const user = await resolveSession(c.env, sessionId);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  c.set("user", user);
  c.set("sessionId", sessionId);
  await next();
}

export async function requireActiveAccount(
  c: Context<{ Bindings: ApiEnv; Variables: AppVariables }>,
  next: Next,
) {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  if (user.status === "pending_approval") {
    return c.json({ error: "account_pending_approval" }, 403);
  }
  if (user.status === "rejected") {
    return c.json({ error: "account_rejected" }, 403);
  }
  if (user.status === "suspended") {
    return c.json({ error: "account_suspended" }, 403);
  }

  await next();
}

export function requirePermission(permission: Permission) {
  return async (c: Context<{ Bindings: ApiEnv; Variables: AppVariables }>, next: Next) => {
    const user = c.get("user");
    if (!hasPermission(user, permission)) return c.json({ error: "Forbidden" }, 403);
    await next();
  };
}

function getSessionCookie(c: Context) {
  const cookie = c.req.header("cookie") ?? "";
  const match = cookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return match?.[1] ?? null;
}

async function resolveSession(env: ApiEnv, sessionId: string): Promise<SessionUser | null> {
  const db = await getDatabase(env);
  const tokenHash = await sha256(sessionId);
  const row = await db
    .prepare(
      `SELECT s.id, s.expires_at, u.id as uid, u.name, u.phone, u.role, u.status, u.dealer_id, u.distributor_id
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.token_hash = ? AND u.status IN ('active', 'pending_approval') AND u.deleted_at IS NULL`,
    )
    .bind(sessionId, tokenHash)
    .first<{
      id: string;
      expires_at: string;
      uid: string;
      name: string;
      phone: string;
      role: SessionUser["role"];
      status: SessionUser["status"];
      dealer_id: string | null;
      distributor_id: string | null;
    }>();

  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;

  return buildSessionUser({
    id: row.uid,
    name: row.name,
    phone: row.phone,
    role: row.role,
    status: row.status,
    dealer_id: row.dealer_id,
    distributor_id: row.distributor_id,
  });
}

export function setSessionCookie(sessionId: string) {
  const maxAge = 30 * 24 * 60 * 60;
  return `${SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
