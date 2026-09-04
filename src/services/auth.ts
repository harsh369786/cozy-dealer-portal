import type { SessionUser, UserRole } from "@/lib/mock/distributor/types";
import { api, ApiError } from "@/lib/api-client";

const SESSION_PERSIST_KEY = "backrest_session_user";
const SESSION_CACHE_TTL_MS = 30_000;

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
    .then((user) => {
      sessionCache = { user, at: Date.now() };
      writeStoredUser(user);
      return user;
    })
    .finally(() => {
      sessionInflight = null;
    });

  return sessionInflight;
}

/**
 * Resolve the current user via /auth/me, tolerant of TRANSIENT auth failures.
 *
 * A single 401/403 is NOT treated as a definitive logout: on some PWA cold launches /
 * deep-link navigations the session cookie is briefly not sent, which returns 401 even
 * though the server session is still valid. We retry once before deciding the user is
 * logged out. Non-auth errors (network/500/timeout) keep the last-known stored user.
 */
async function fetchCurrentUser(stored: SessionUser | null): Promise<SessionUser | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await api.get<{ user: SessionUser }>("/api/v1/auth/me");
      return res.user;
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      const isAuthError = status === 401 || status === 403;

      if (isAuthError && attempt === 0) {
        // Transient: give the cookie a moment and try once more before clearing.
        await delay(400);
        continue;
      }
      if (isAuthError) {
        // Confirmed logged out after a retry.
        return null;
      }
      // Network / server error: don't destroy a working session over a blip.
      return stored ?? null;
    }
  }
  return stored ?? null;
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
