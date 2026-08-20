import type { Permission, SessionUser, UserRole } from "./types";

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  master_admin: [
    "orders:read",
    "orders:approve",
    "orders:reject",
    "orders:status:fulfillment",
    "orders:cancel",
    "dealers:read",
    "catalog:read",
    "catalog:write",
    "campaigns:read",
    "campaigns:write",
    "rewards:read",
    "complaints:read",
    "complaints:update",
    "notifications:read",
    "reports:read",
    "users:read",
    "users:write",
    "settings:read",
    "settings:write",
    "audit:read",
    "signup:review",
    "assignments:read",
    "assignments:write",
  ],
  admin_staff: [
    "orders:read",
    "orders:status:fulfillment",
    "dealers:read",
    "catalog:read",
    "catalog:write",
    "campaigns:read",
    "campaigns:write",
    "rewards:read",
    "complaints:read",
    "notifications:read",
    "users:read",
    "settings:read",
    "audit:read",
    "signup:review",
  ],
  distributor: [
    "orders:read",
    "orders:approve",
    "orders:reject",
    "dealers:read",
    "catalog:read",
    "campaigns:read",
    "rewards:read",
    "complaints:read",
    "notifications:read",
    "reports:read",
  ],
  sales_executive: [
    "orders:read",
    "dealers:read",
    "catalog:read",
    "campaigns:read",
    "rewards:read",
    "complaints:read",
    "notifications:read",
    "reports:read",
  ],
  dealer: [
    "orders:read",
    "orders:create",
    "catalog:read",
    "campaigns:read",
    "rewards:read",
    "rewards:redeem",
    "complaints:read",
    "complaints:create",
    "notifications:read",
  ],
};

export function permissionsForRole(role: UserRole): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function buildSessionUser(row: {
  id: string;
  name: string;
  phone: string;
  role: UserRole;
  dealer_id?: string | null;
  distributor_id?: string | null;
}): SessionUser {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    role: row.role,
    dealerId: row.dealer_id ?? undefined,
    distributorId: row.distributor_id ?? undefined,
    permissions: permissionsForRole(row.role),
  };
}

export function hasPermission(user: SessionUser, permission: Permission) {
  return user.permissions.includes(permission);
}
