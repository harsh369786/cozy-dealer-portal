import { useMemo } from "react";
import type { Permission } from "@/lib/admin/rbac";
import { hasAnyPermission, hasPermission, permissionsForRole } from "@/lib/admin/rbac";
import { useSession } from "@/hooks/use-session";

export function useAdminPermissions() {
  const { user, loading } = useSession();

  const permissions = useMemo<Permission[]>(() => {
    if (loading || !user?.role) return [];
    const fromSession = user.permissions as Permission[] | undefined;
    if (Array.isArray(fromSession)) return fromSession;
    return permissionsForRole(user.role);
  }, [loading, user?.role, user?.permissions]);

  const isMasterAdmin = !loading && user?.role === "master_admin";

  const can = (permission: Permission) => !loading && hasPermission(permissions, permission);

  const canAny = (...required: Permission[]) =>
    !loading && hasAnyPermission(permissions, required);

  return { permissions, isMasterAdmin, can, canAny, user, loading };
}
