import type { SessionUser, UserRole } from "@/lib/mock/distributor/types";
import { api, ApiError } from "@/lib/api-client";

const SESSION_PERSIST_KEY = "backrest_session_user";
const SESSION_CACHE_TTL_MS = 30_000;
// Readable companion cookie set by the server alongside the HttpOnly session cookie (see
// SESSION_PRESENT_COOKIE in api/utils.ts). The real session token is HttpOnly and invisible to JS,
// so this non-secret marker is the ONLY way the client can tell "a session should exist, the
// browser just hasn't attached the cookie to this request yet" from "genuinely logged out". The
// server clears this marker whenever it clears the session cookie (real logout / expiry), so:
//   marker present  → keep the session on a transient 401 (cookie is attaching; don't self-logout)
//   marker absent   → a persistent 401 is a real logout
const SESSION_PRESENT_COOKIE = "backrest_session_present";

/** True if the readable session-presence marker cookie is currently set. */
function hasSessionPresentCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split(";")
    .some((part) => part.trim().startsWith(`${SESSION_PRESENT_COOKIE}=`));
}

export function getHomePath(role: UserRole): string {
  // sales_head is a view-only oversight role that lives in the admin area (read-only screens).
  if (role === "master_admin" || role === "admin_staff" || role === "sales_head") return "/admin";
  if (role === "distributor" || role === "sales_executive") return "/distributor/dashboard";
  return "/home";
}

export function getPostLoginPath(user: SessionUser): string {
  if (user.status === "pending_approval") return "/pending-approval";
  return getHomePath(user.role);
}

let sessionCache: { user: SessionUser | null; at: number } | null = null;
let sessionInflight: Promise<SessionUser | null> | null = null;
let onSessionInvalidate: (() => void) | null = null;
// Set true once /auth/me has confirmed a session in THIS app runtime. After that, the cookie is
// known to be attaching, so a persistent 401 is a REAL server-side logout (suspended / session
// deleted) and should clear local state — not be treated as a cold-launch blip. Before the first
// confirmation (cold launch), a persistent 401 with a stored user is treated as unconfirmed so we
// don't self-logout while the cookie is still attaching.
let everConfirmedSession = false;

function readStoredUser(): SessionUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_PERSIST_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

function writeStoredUser(user: SessionUser | null) {
  if (typeof window === "undefined") return;
  try {
    if (user) localStorage.setItem(SESSION_PERSIST_KEY, JSON.stringify(user));
    else localStorage.removeItem(SESSION_PERSIST_KEY);
  } catch {
    // ignore quota / private mode
  }
}

export function registerSessionInvalidateHandler(handler: () => void) {
  onSessionInvalidate = handler;
}

export function invalidateSessionCache() {
  sessionCache = null;
  sessionInflight = null;
  writeStoredUser(null);
  onSessionInvalidate?.();
}

export function peekCachedUser(): SessionUser | null {
  if (hasFreshSessionCache()) return sessionCache!.user;
  return readStoredUser();
}

export function hasFreshSessionCache(): boolean {
  return sessionCache != null && Date.now() - sessionCache.at < SESSION_CACHE_TTL_MS;
}

export function hasCachedSession(): boolean {
  return hasFreshSessionCache() || readStoredUser() != null;
}

export async function requestOtp(phone: string): Promise<void> {
  await api.post("/api/v1/auth/otp/request", { phone });
}

export async function verifyOtp(phone: string, code: string): Promise<SessionUser> {
  const res = await api.post<{ user: SessionUser }>("/api/v1/auth/otp/verify", { phone, code });
  sessionCache = { user: res.user, at: Date.now() };
  writeStoredUser(res.user);
  return res.user;
}

export async function demoLogin(phone: string): Promise<SessionUser> {
  const res = await api.post<{ user: SessionUser }>("/api/v1/auth/demo-login", { phone });
  sessionCache = { user: res.user, at: Date.now() };
  writeStoredUser(res.user);
  return res.user;
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  if (sessionCache && Date.now() - sessionCache.at < SESSION_CACHE_TTL_MS) {
    return sessionCache.user;
  }

  const stored = readStoredUser();
  if (stored && !sessionCache) {
    sessionCache = { user: stored, at: Date.now() };
  }

  if (sessionInflight) return sessionInflight;

  sessionInflight = fetchCurrentUser(stored)
    .then((result) => {
      if (result.confirmedLoggedOut) {
        // The server DEFINITIVELY reported no session (see fetchCurrentUser). Clear local state.
        sessionCache = { user: null, at: Date.now() };
        writeStoredUser(null);
        return null;
      }
      if (result.user) {
        // Confirmed authenticated: refresh cache + stored user.
        sessionCache = { user: result.user, at: Date.now() };
        writeStoredUser(result.user);
        return result.user;
      }
      // UNCONFIRMED (transient auth blip on a PWA cold launch, or network/server error): do NOT
      // wipe the stored user. Keep showing the last-known user; a later revalidation (mount /
      // pageshow / visibilitychange re-fires getCurrentUser once the cache TTL lapses) will
      // self-correct when the session cookie is attached. Cache briefly so we don't hammer.
      sessionCache = { user: stored, at: Date.now() };
      // (Intentionally NOT calling writeStoredUser — leave localStorage intact.)
      return stored ?? null;
    })
    .finally(() => {
      sessionInflight = null;
    });

  return sessionInflight;
}

type FetchCurrentUserResult = {
  /** The authenticated user, when /auth/me returned one. */
  user: SessionUser | null;
  /**
   * True ONLY when the server definitively told us there is no session AND we had no session to
   * begin with — i.e. a real logout, not a transient cold-launch cookie blip. When false and
   * user is null, the caller must KEEP the stored user (do not clear).
   */
  confirmedLoggedOut: boolean;
};

/**
 * Resolve the current user via /auth/me, tolerant of TRANSIENT auth failures.
 *
 * On installed-PWA cold launches / deep links the session cookie is sometimes not attached to the
 * first request(s), returning 401 even though the 30-day server session is still valid. Treating
 * that as a logout wipes a working session and bounces the user to login. So:
 *   - Retry auth failures several times with backoff to give the cookie time to attach.
 *   - Only report confirmedLoggedOut when we had NO stored user AND still got auth errors (a
 *     genuinely-signed-out visitor). If we DID have a stored user, a persistent 401 is treated as
 *     UNCONFIRMED — we keep the stored user and let a later revalidation correct it. A definitive
 *     logout still happens via logout()/invalidateSessionCache().
 *   - Network / server errors always keep the stored user.
 */
async function fetchCurrentUser(stored: SessionUser | null): Promise<FetchCurrentUserResult> {
  const AUTH_RETRY_DELAYS_MS = [300, 600, 900]; // 4 attempts total, ~1.8s of cushion for the cookie
  for (let attempt = 0; attempt <= AUTH_RETRY_DELAYS_MS.length; attempt++) {
    try {
      const res = await api.get<{ user: SessionUser }>("/api/v1/auth/me");
      everConfirmedSession = true;
      return { user: res.user, confirmedLoggedOut: false };
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      const isAuthError = status === 401 || status === 403;

      if (isAuthError && attempt < AUTH_RETRY_DELAYS_MS.length) {
        // Transient: wait (increasing backoff) and retry — the cookie may attach shortly.
        await delay(AUTH_RETRY_DELAYS_MS[attempt]!);
        continue;
      }
      if (isAuthError) {
        // Auth errors exhausted. The readable presence marker is the authoritative signal now:
        // the server sets it with the session cookie and CLEARS it only on a real logout / expiry
        // (see api/middleware/auth.ts clearSessionCookies). So:
        //   - marker STILL present → the server thinks a session exists; this 401 is the cookie not
        //     being attached yet (PWA cold-launch / webview timing). Treat as UNCONFIRMED: keep the
        //     stored user and let a later revalidation succeed. NEVER self-logout here.
        //   - marker ABSENT → treat as a CONFIRMED logout when there is no stored user, or a session
        //     was confirmed earlier this runtime (a genuine server-side revoke/expiry). Otherwise
        //     (cold launch, stored user, never confirmed, marker somehow absent) stay conservative
        //     and keep the stored user.
        if (hasSessionPresentCookie()) {
          return { user: null, confirmedLoggedOut: false };
        }
        return { user: null, confirmedLoggedOut: !stored || everConfirmedSession };
      }
      // Network / server error: never destroy a working session over a blip.
      return { user: stored ?? null, confirmedLoggedOut: false };
    }
  }
  return { user: stored ?? null, confirmedLoggedOut: false };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function logout(): Promise<void> {
  await api.post("/api/v1/auth/logout");
  invalidateSessionCache();
}

export function isLoggedIn(): boolean {
  return sessionCache?.user != null || readStoredUser() != null;
}

export function getRole(): UserRole | null {
  return sessionCache?.user?.role ?? readStoredUser()?.role ?? null;
}

export function isPendingApproval(user: SessionUser | null | undefined): boolean {
  return user?.status === "pending_approval";
}
