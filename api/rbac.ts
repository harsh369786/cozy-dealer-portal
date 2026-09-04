import type { Permission, SessionUser, UserAccountStatus, UserRole } from "./types";
import { permissionsForSharedRole, sharedHasPermission, ROLE_PERMISSIONS } from "../shared/rbac-permissions";

export function permissionsForRole(role: UserRole): Permission[] {
  return permissionsForSharedRole(role) as Permission[];
}

export function buildSessionUser(row: {
  id: string;
  name: string;
  phone: string;
  role: UserRole;
  status?: UserAccountStatus | string;
  dealer_id?: string | null;
  distributor_id?: string | null;
}): SessionUser {
  const status = (row.status ?? "active") as UserAccountStatus;
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    role: row.role,
    status,
    dealerId: row.dealer_id ?? undefined,
    distributorId: row.distributor_id ?? undefined,
    permissions: status === "active" ? permissionsForRole(row.role) : [],
  };
}

export function hasPermission(user: SessionUser, permission: Permission) {
  return sharedHasPermission(user.permissions, permission);
}

/**
 * Resolve the EFFECTIVE role for a user, applying any row in user_role_overrides (e.g.
 * 'sales_head'). The stored users.role is a CHECK-legal base value; this returns the override
 * when present, otherwise the base role. Used at login so the immediate response carries the
 * correct role/permissions (resolveSession already applies the same override on every request).
 */
export async function resolveEffectiveRole(
  db: D1Database,
  userId: string,
  baseRole: UserRole,
): Promise<UserRole> {
  try {
    const row = await db
      .prepare(`SELECT role FROM user_role_overrides WHERE user_id = ?`)
      .bind(userId)
      .first<{ role: string }>();
    return (row?.role as UserRole) ?? baseRole;
  } catch {
    // If the overrides table doesn't exist yet (migration not applied), fall back to base role.
    return baseRole;
  }
}

export { ROLE_PERMISSIONS };
