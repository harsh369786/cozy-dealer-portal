import type { SessionUser, UserRole } from "@/lib/mock/distributor/types";
import { api } from "@/lib/api-client";

export function getHomePath(role: UserRole): string {
  if (role === "master_admin" || role === "admin_staff") return "/admin";
  if (role === "distributor") return "/distributor/dashboard";
  if (role === "sales_executive") return "/distributor/dealers";
  return "/home";
}

export async function requestOtp(phone: string): Promise<void> {
  await api.post("/api/v1/auth/otp/request", { phone });
}

export async function verifyOtp(phone: string, code: string): Promise<SessionUser> {
  const res = await api.post<{ user: SessionUser }>("/api/v1/auth/otp/verify", { phone, code });
  return res.user;
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  try {
    const res = await api.get<{ user: SessionUser }>("/api/v1/auth/me");
    return res.user;
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  await api.post("/api/v1/auth/logout");
}

export function isLoggedIn(): boolean {
  return false;
}
