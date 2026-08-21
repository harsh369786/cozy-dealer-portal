import { redirect } from "@tanstack/react-router";
import type { UserRole } from "@/lib/mock/distributor/types";
import { getCurrentUser, getHomePath, getPostLoginPath } from "@/services/auth";

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw redirect({ to: "/" });
  if (user.status === "pending_approval") throw redirect({ to: "/pending-approval" });
  if (user.status === "rejected" || user.status === "suspended") throw redirect({ to: "/" });
  return user;
}

export async function requirePendingUser() {
  const user = await getCurrentUser();
  if (!user) throw redirect({ to: "/" });
  if (user.status !== "pending_approval") {
    throw redirect({ to: getPostLoginPath(user) });
  }
  return user;
}

export async function requireRoles(roles: UserRole[]) {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    throw redirect({ to: getHomePath(user.role) });
  }
  return user;
}
