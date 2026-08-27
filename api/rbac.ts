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

export { ROLE_PERMISSIONS };
