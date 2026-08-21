import type { SessionUser, UserRole } from "@/lib/mock/distributor/types";
import { api } from "@/lib/api-client";

export function getHomePath(role: UserRole): string {
  if (role === "master_admin" || role === "admin_staff") return "/admin";
  if (role === "distributor") return "/distributor/dashboard";
  if (role === "sales_executive") return "/distributor/dealers";
  return "/home";
}

export function getPostLoginPath(user: SessionUser): string {
  if (user.status === "pending_approval") return "/pending-approval";
  return getHomePath(user.role);
}

const SESSION_CACHE_TTL_MS = 30_000;

let sessionCache: { user: SessionUser | null; at: number } | null = null;
let sessionInflight: Promise<SessionUser | null> | null = null;

export function invalidateSessionCache() {
  sessionCache = null;
  sessionInflight = null;
}

export async function requestOtp(phone: string): Promise<void> {
  await api.post("/api/v1/auth/otp/request", { phone });
}

export async function verifyOtp(phone: string, code: string): Promise<SessionUser> {
  const res = await api.post<{ user: SessionUser }>("/api/v1/auth/otp/verify", { phone, code });
  sessionCache = { user: res.user, at: Date.now() };
  return res.user;
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  if (sessionCache && Date.now() - sessionCache.at < SESSION_CACHE_TTL_MS) {
    return sessionCache.user;
  }
  if (sessionInflight) return sessionInflight;

  sessionInflight = api
    .get<{ user: SessionUser }>("/api/v1/auth/me")
    .then((res) => {
      sessionCache = { user: res.user, at: Date.now() };
      return res.user;
    })
    .catch(() => {
      sessionCache = { user: null, at: Date.now() };
      return null;
    })
    .finally(() => {
      sessionInflight = null;
    });

  return sessionInflight;
}

export async function logout(): Promise<void> {
  await api.post("/api/v1/auth/logout");
  invalidateSessionCache();
}

export function isLoggedIn(): boolean {
  return sessionCache?.user != null;
}

export function getRole(): UserRole | null {
  return sessionCache?.user?.role ?? null;
}

export function isPendingApproval(user: SessionUser | null | undefined): boolean {
  return user?.status === "pending_approval";
}
