import { useMemo } from "react";
import type { Permission } from "@/lib/admin/rbac";
import { hasAnyPermission, hasPermission, permissionsForRole } from "@/lib/admin/rbac";
import { useSession } from "@/hooks/use-session";

export function useAdminPermissions() {
  const { user } = useSession();

  const permissions = useMemo<Permission[]>(() => {
    if (user?.permissions?.length) return user.permissions as Permission[];
    if (user?.role) return permissionsForRole(user.role);
    return [];
  }, [user]);

  const isMasterAdmin = user?.role === "master_admin";

  const can = (permission: Permission) =>
    isMasterAdmin || hasPermission(permissions, permission);

  const canAny = (...required: Permission[]) =>
    isMasterAdmin || hasAnyPermission(permissions, required);

  return { permissions, isMasterAdmin, can, canAny, user };
}
