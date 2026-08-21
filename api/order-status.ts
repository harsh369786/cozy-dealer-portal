import type { SessionUser, UserRole } from "./types";

export const ORDER_STATUSES = [
  "order_placed",
  "approved",
  "in_making",
  "out_for_delivery",
  "delivered",
  "rejected",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  order_placed: "Order Placed",
  approved: "Approved",
  in_making: "In Making",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

/** Roles allowed to set each status (excluding reject which uses separate endpoint). */
const STATUS_UPDATE_ROLES: Record<Exclude<OrderStatus, "order_placed" | "rejected">, UserRole[]> = {
  approved: ["distributor", "master_admin"],
  in_making: ["admin_staff", "master_admin"],
  out_for_delivery: ["admin_staff", "master_admin"],
  delivered: ["admin_staff", "master_admin"],
  cancelled: ["master_admin"],
};

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  order_placed: ["approved", "rejected"],
  approved: ["in_making", "cancelled"],
  in_making: ["out_for_delivery"],
  out_for_delivery: ["delivered"],
  delivered: [],
  rejected: [],
  cancelled: [],
};

export function canRoleSetStatus(role: UserRole, status: OrderStatus): boolean {
  if (status === "rejected") return role === "distributor" || role === "master_admin";
  if (status === "order_placed") return false;
  return STATUS_UPDATE_ROLES[status as keyof typeof STATUS_UPDATE_ROLES]?.includes(role) ?? false;
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertStatusUpdate(user: SessionUser, from: OrderStatus, to: OrderStatus) {
  if (from === to) {
    throw new Error(`Order is already ${ORDER_STATUS_LABELS[from]}`);
  }
  if (to === "rejected") {
    throw new Error("Use the reject action for rejected orders");
  }
  // Master admin can move orders forward or backward across operational statuses.
  if (user.role === "master_admin") {
    if (from === "cancelled" || from === "rejected") {
      throw new Error(`Cannot change status from ${ORDER_STATUS_LABELS[from]}`);
    }
    return;
  }
  if (!canTransition(from, to)) {
    throw new Error(`Cannot change status from ${ORDER_STATUS_LABELS[from]} to ${ORDER_STATUS_LABELS[to]}`);
  }
  if (!canRoleSetStatus(user.role, to)) {
    throw new Error(`Your role cannot set status to ${ORDER_STATUS_LABELS[to]}`);
  }
}

export function normalizeLegacyStatus(status: string): OrderStatus {
  const map: Record<string, OrderStatus> = {
    pending_approval: "order_placed",
    in_production: "in_making",
  };
  if (ORDER_STATUSES.includes(status as OrderStatus)) return status as OrderStatus;
  return map[status] ?? "order_placed";
}
