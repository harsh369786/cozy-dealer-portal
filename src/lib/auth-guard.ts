import { redirect } from "@tanstack/react-router";
import type { UserRole } from "@/lib/mock/distributor/types";
import type { SessionUser } from "@/lib/mock/distributor/types";
import { getCurrentUser, getHomePath, getPostLoginPath } from "@/services/auth";

function deferOnSsr(): SessionUser | null {
  if (import.meta.env.SSR) return null;
  return null;
}

export async function requireUser() {
  if (import.meta.env.SSR) return deferOnSsr() as SessionUser;
  const user = await getCurrentUser();
  if (!user) throw redirect({ to: "/" });
  if (user.status === "pending_approval") throw redirect({ to: "/pending-approval" });
  if (user.status === "rejected" || user.status === "suspended") throw redirect({ to: "/" });
  return user;
}

export async function requirePendingUser() {
  if (import.meta.env.SSR) return deferOnSsr() as SessionUser;
  const user = await getCurrentUser();
  if (!user) throw redirect({ to: "/" });
  if (user.status !== "pending_approval") {
    throw redirect({ to: getPostLoginPath(user) });
  }
  return user;
}

export async function requireRoles(roles: UserRole[]) {
  const user = await requireUser();
  if (import.meta.env.SSR) return user;
  if (!roles.includes(user.role)) {
    throw redirect({ to: getHomePath(user.role) });
  }
  return user;
}
