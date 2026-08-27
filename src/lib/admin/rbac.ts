import type { UserRole } from "@/lib/mock/distributor/types";
import {
  permissionsForSharedRole,
  sharedHasAnyPermission,
  sharedHasPermission,
  type SharedPermission,
} from "../../../shared/rbac-permissions";

export type Permission = SharedPermission;

export function permissionsForRole(role: UserRole): Permission[] {
  return permissionsForSharedRole(role) as Permission[];
}

export function hasPermission(permissions: Permission[], permission: Permission) {
  return sharedHasPermission(permissions, permission);
}

export function hasAnyPermission(permissions: Permission[], required: Permission[]) {
  return sharedHasAnyPermission(permissions, required);
}
