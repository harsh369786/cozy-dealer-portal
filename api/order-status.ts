import type { SessionUser, UserRole } from "./types";

/**
 * P0-6: thrown when a status change violates the state machine (invalid/skip-ahead transition).
 * Route handlers map this to HTTP 422 (distinct from role/permission errors which stay 400/403).
 */
export class InvalidStatusTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidStatusTransitionError";
  }
}

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
  delivered: ["admin_staff", "master_admin", "distributor"],
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

/**
 * P0-6: A master admin may CORRECT an order by stepping one status backward across the operational
 * chain (existing product behavior), but must NEVER skip steps forward (e.g. order_placed →
 * delivered, which would credit reward points without an approval/dispatch step). This is the
 * single-step ADJACENCY of the state machine: a transition is allowed iff it's a valid forward step
 * OR the exact reverse of one. It does NOT loosen the strict per-role rules below — it only bounds
 * the master-admin override so the state machine still applies to every role with no skip-ahead.
 */
function isAdjacentTransition(from: OrderStatus, to: OrderStatus): boolean {
  const forward = VALID_TRANSITIONS[from]?.includes(to) ?? false;
  const backward = VALID_TRANSITIONS[to]?.includes(from) ?? false;
  return forward || backward;
}

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
  // Master admin can move orders forward or backward across operational statuses, but NOT out of
  // a terminal state. 'delivered' already credited reward points; moving it backward would create
  // an inconsistent timeline (delivered → in_making) without reversing the points.
  if (user.role === "master_admin") {
    if (from === "cancelled" || from === "rejected" || from === "delivered") {
      throw new Error(`Cannot change status from ${ORDER_STATUS_LABELS[from]}`);
    }
    // P0-6: even a master admin must move ONE step at a time along the state machine — no skipping
    // steps forward (e.g. order_placed → delivered would credit rewards without approval/dispatch).
    // A single backward correction step remains allowed (isAdjacentTransition accepts the reverse).
    if (!isAdjacentTransition(from, to)) {
      throw new InvalidStatusTransitionError(
        `Invalid status transition from ${ORDER_STATUS_LABELS[from]} to ${ORDER_STATUS_LABELS[to]}.`,
      );
    }
    return;
  }
  if (!canTransition(from, to)) {
    throw new InvalidStatusTransitionError(
      `Cannot change status from ${ORDER_STATUS_LABELS[from]} to ${ORDER_STATUS_LABELS[to]}`,
    );
  }
  if (!canRoleSetStatus(user.role, to)) {
    throw new Error(`Your role cannot set status to ${ORDER_STATUS_LABELS[to]}`);
  }
  if (user.role === "distributor" && to === "delivered" && from !== "out_for_delivery") {
    throw new Error("Distributors can only mark delivered when the order is out for delivery");
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
