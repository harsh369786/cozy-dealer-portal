/** Single source of truth for role → permission mappings (api + frontend). */

export const ROLE_PERMISSIONS = {
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
    // Reward-claim workflow (separate from orders). master_admin can do any stage.
    "rewards:approve",
    "rewards:process",
    "rewards:deliver",
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
    "visits:read",
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
    // Admin staff processes approved claims: Approved -> Processing -> Dispatched from Factory.
    "rewards:process",
    "complaints:read",
    "complaints:update",
    "notifications:read",
    // Operational admin needs reports/analytics: the admin dashboard's dealer/distributor/sales
    // KPIs come from /api/v1/admin/analytics (gated on reports:read). Without this, admin_staff got
    // a 403 there and the dashboard showed 0 dealers / 0 distributors / 0 sales even though the
    // shared DB has the data. Granting it makes admin_staff's dashboard match master_admin's.
    "reports:read",
    "users:read",
    "settings:read",
    "audit:read",
    "signup:review",
    "assignments:read",
    "visits:read",
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
    "visits:create",
    "visits:read",
  ],
  distributor: [
    "orders:read",
    "orders:approve",
    "orders:reject",
    "orders:deliver",
    "dealers:read",
    "catalog:read",
    "campaigns:read",
    "rewards:read",
    // Reward-claim workflow: distributor approves/rejects claimed rewards and confirms delivery.
    "rewards:approve",
    "rewards:deliver",
    "complaints:read",
    "notifications:read",
    "reports:read",
    "visits:read",
  ],
  // Strictly VIEW-ONLY oversight role. Read permissions only — no write/approve/reject/redeem,
  // no user management, no settings. Used for a head-of-sales who monitors the whole operation.
  sales_head: [
    "orders:read",
    "dealers:read",
    "catalog:read",
    "campaigns:read",
    "rewards:read",
    "complaints:read",
    "notifications:read",
    "reports:read",
    "assignments:read",
    "visits:read",
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
} as const;

export type SharedUserRole = keyof typeof ROLE_PERMISSIONS;
export type SharedPermission = (typeof ROLE_PERMISSIONS)[SharedUserRole][number];

export function permissionsForSharedRole(role: SharedUserRole): SharedPermission[] {
  return [...(ROLE_PERMISSIONS[role] ?? [])];
}

export function sharedHasPermission(
  permissions: readonly string[],
  permission: string,
): boolean {
  return permissions.includes(permission);
}

export function sharedHasAnyPermission(
  permissions: readonly string[],
  required: readonly string[],
): boolean {
  return required.some((p) => permissions.includes(p));
}
