import { useMemo } from "react";
import type { Permission } from "@/lib/admin/rbac";
import { hasAnyPermission, hasPermission, permissionsForRole } from "@/lib/admin/rbac";
import { useSession } from "@/hooks/use-session";

export function useAdminPermissions() {
  const { user, loading } = useSession();

  const permissions = useMemo<Permission[]>(() => {
    if (loading) return [];
    if (user?.permissions?.length) return user.permissions as Permission[];
    if (user?.role) return permissionsForRole(user.role);
    return [];
  }, [loading, user]);

  const isMasterAdmin = !loading && user?.role === "master_admin";

  const can = (permission: Permission) =>
    !loading && (isMasterAdmin || hasPermission(permissions, permission));

  const canAny = (...required: Permission[]) =>
    !loading && (isMasterAdmin || hasAnyPermission(permissions, required));

  return { permissions, isMasterAdmin, can, canAny, user, loading };
}
