import type { ReactNode } from "react";
import type { Permission } from "@/lib/admin/rbac";
import { EmptyState, PageSkeleton } from "@/components/shared/states";
import { useAdminPermissions } from "@/hooks/use-admin-permissions";

export function AdminPermissionGate({
  permission,
  permissions,
  children,
  fallback,
}: {
  permission?: Permission;
  permissions?: Permission[];
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { can, canAny, loading } = useAdminPermissions();
  const allowed = permission ? can(permission) : permissions ? canAny(...permissions) : true;

  if (loading) {
    return fallback === undefined ? <PageSkeleton rows={2} /> : null;
  }

  if (!allowed) {
    return (
      fallback ?? (
        <EmptyState
          title="Access restricted"
          description="You don't have permission to perform this action."
        />
      )
    );
  }

  return <>{children}</>;
}
