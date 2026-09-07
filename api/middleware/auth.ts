import type { Context, Next } from "hono";
import type { ApiEnv, AppVariables, SessionUser } from "../types";
import { buildSessionUser, hasPermission } from "../rbac";
import type { Permission } from "../types";
import { SESSION_COOKIE, SESSION_PRESENT_COOKIE, sha256 } from "../utils";
import { getRequestDb } from "../db/get-db";

export async function optionalAuth(c: Context<{ Bindings: ApiEnv; Variables: AppVariables }>, next: Next) {
  const sessionId = getSessionCookie(c);
  if (sessionId) {
    const db = await getRequestDb(c);
    const resolved = await resolveSession(db, sessionId);
    if (resolved.user) {
      c.set("user", resolved.user);
      c.set("sessionId", sessionId);
    } else if (resolved.invalid) {
      // Only clear when the session is DEFINITIVELY gone — not on a transient DB error, which
      // would otherwise erase a valid cookie and cause the reopen auto-logout.
      clearSessionCookies(c);
    }
  }
  await next();
}

export async function requireAuth(c: Context<{ Bindings: ApiEnv; Variables: AppVariables }>, next: Next) {
  const sessionId = getSessionCookie(c);
  if (!sessionId) return c.json({ error: "Unauthorized" }, 401);
  const db = await getRequestDb(c);
  const resolved = await resolveSession(db, sessionId);
  if (!resolved.user) {
    // A missing cookie value never reaches here (handled above). If the session is DEFINITIVELY
    // invalid/expired, clear the cookies; if it's a TRANSIENT DB error, leave the cookie intact so
    // a momentary blip on a PWA cold-launch doesn't permanently log the user out — just 401 this one.
    if (resolved.invalid) clearSessionCookies(c);
    return c.json({ error: "Unauthorized" }, 401);
  }
  c.set("user", resolved.user);
  c.set("sessionId", sessionId);
  await next();
}

/** Clear BOTH the HttpOnly session cookie and the readable presence marker. */
function clearSessionCookies(c: Context) {
  const secure = isSecureCookie(c);
  c.header("Set-Cookie", clearSessionCookie(secure), { append: true });
  c.header("Set-Cookie", clearSessionPresentCookie(secure), { append: true });
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
    // Guard against a missing user (defensive: these middlewares always run after requireAuth,
    // but a null user would make hasPermission throw a 500 instead of a clean 401).
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    if (!hasPermission(user, permission)) return c.json({ error: "Forbidden" }, 403);
    await next();
  };
}

export function requireAnyPermission(...permissions: Permission[]) {
  return async (c: Context<{ Bindings: ApiEnv; Variables: AppVariables }>, next: Next) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    if (!permissions.some((p) => hasPermission(user, p))) return c.json({ error: "Forbidden" }, 403);
    await next();
  };
}

function getSessionCookie(c: Context) {
  const cookie = c.req.header("cookie") ?? "";
  const match = cookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return match?.[1] ?? null;
}

/**
 * Result of resolving a session cookie.
 *  - { user }              → valid session.
 *  - { invalid: true }     → the session is DEFINITIVELY gone (no matching row, or expired and
 *                            deleted, or the user is no longer active). Safe to clear the cookie.
 *  - { transient: true }   → we could NOT determine validity (a D1 read error). The cookie may be
 *                            perfectly valid; DO NOT clear it — a momentary DB blip must not log the
 *                            user out. Return 401 for this request only.
 *
 * This distinction is the core of the auto-logout fix: previously any null result cleared the
 * cookie, so a single cookie-less-or-hiccuping request permanently erased a valid 30-day session.
 */
type ResolvedSession =
  | { user: SessionUser; invalid?: false; transient?: false }
  | { user?: undefined; invalid: true; transient?: false }
  | { user?: undefined; invalid?: false; transient: true };

async function resolveSession(db: D1Database, sessionId: string): Promise<ResolvedSession> {
  const tokenHash = await sha256(sessionId);
  // ovr.role is the effective-role override (e.g. 'sales_head'), stored in user_role_overrides
  // because the users.role CHECK constraint can't be altered on prod D1. COALESCE upgrades the
  // effective role when an override exists; users.role stays a CHECK-legal base value.
  let row:
    | {
        id: string;
        expires_at: string;
        uid: string;
        name: string;
        phone: string;
        role: SessionUser["role"];
        status: SessionUser["status"];
        dealer_id: string | null;
        distributor_id: string | null;
      }
    | null;
  try {
    row = await db
      .prepare(
        `SELECT s.id, s.expires_at, u.id as uid, u.name, u.phone,
                COALESCE(ovr.role, u.role) as role, u.status, u.dealer_id, u.distributor_id
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         LEFT JOIN user_role_overrides ovr ON ovr.user_id = u.id
         WHERE s.id = ? AND s.token_hash = ? AND u.status IN ('active', 'pending_approval') AND u.deleted_at IS NULL`,
      )
      .bind(sessionId, tokenHash)
      .first();
  } catch {
    // D1 read error (transient). We genuinely don't know if the session is valid, so treat this as
    // UNRESOLVED and keep the cookie intact — never log the user out over a database blip.
    return { transient: true };
  }

  // No matching row: the session id / token is not a live session (unknown, already deleted, or the
  // user is no longer active). This is DEFINITIVE — safe to clear the cookie.
  if (!row) return { invalid: true };

  if (new Date(row.expires_at).getTime() < Date.now()) {
    // Genuinely expired. Delete the row and clear the cookie.
    try {
      await db.prepare(`DELETE FROM sessions WHERE id = ?`).bind(sessionId).run();
    } catch {
      // If the cleanup delete fails it's not fatal — the session is still expired for this request.
    }
    return { invalid: true };
  }

  return {
    user: buildSessionUser({
      id: row.uid,
      name: row.name,
      phone: row.phone,
      role: row.role,
      status: row.status,
      dealer_id: row.dealer_id,
      distributor_id: row.distributor_id,
    }),
  };
}

function cookieFlags(secure: boolean) {
  return secure ? "; Secure" : "";
}

function isSecureCookie(c: Context) {
  return isSecureCookieEnv((c.env as ApiEnv | undefined)?.ENVIRONMENT);
}

export function isSecureCookieEnv(environment?: string) {
  return environment !== "development" && environment !== "local";
}

// SameSite=Lax (not Strict): the cookie must be sent on top-level navigations such as
// installed-PWA cold launches, notification deep links, and links opened from outside the
// app. Strict withholds the cookie on those, producing a spurious 401 → logout even though
// the server session is still valid. Lax keeps CSRF protection for cross-site subrequests.
export function setSessionCookie(sessionId: string, secure = true) {
  const maxAge = 30 * 24 * 60 * 60;
  return `${SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${cookieFlags(secure)}`;
}

export function clearSessionCookie(secure = true) {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${cookieFlags(secure)}`;
}

// Readable companion "presence" marker. Set alongside the real session cookie whenever a session is
// created, and cleared whenever the session cookie is cleared. It carries NO secret (just "1") and is
// intentionally NOT HttpOnly so the client JS can read it via document.cookie. Its only purpose: let
// the client tell "the browser just hasn't attached the (HttpOnly) session cookie yet" (marker
// present → keep waiting/retrying, don't self-logout) apart from "really signed out" (marker absent).
// Same Path/SameSite/Secure/Max-Age as the session cookie so the two travel and expire together.
export function setSessionPresentCookie(secure = true) {
  const maxAge = 30 * 24 * 60 * 60;
  return `${SESSION_PRESENT_COOKIE}=1; Path=/; SameSite=Lax; Max-Age=${maxAge}${cookieFlags(secure)}`;
}

export function clearSessionPresentCookie(secure = true) {
  return `${SESSION_PRESENT_COOKIE}=; Path=/; SameSite=Lax; Max-Age=0${cookieFlags(secure)}`;
}
