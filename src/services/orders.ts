import type { DistributorOrder } from "@/lib/mock/distributor/types";
import { DISTRIBUTOR_ID, seedOrders } from "@/lib/mock/distributor/data";
import { getRole } from "./auth";

const STORAGE_KEY = "backrest-distributor-orders";

function loadOrders(): DistributorOrder[] {
  if (typeof window === "undefined") return [...seedOrders];
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seedOrders));
    return [...seedOrders];
  }
  try {
    return JSON.parse(raw) as DistributorOrder[];
  } catch {
    return [...seedOrders];
  }
}

function saveOrders(orders: DistributorOrder[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
}

function scoped(orders: DistributorOrder[]) {
  return orders.filter((o) => o.distributorId === DISTRIBUTOR_ID);
}

function nowLabel() {
  const d = new Date();
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export async function getOrders(simulateError = false): Promise<DistributorOrder[]> {
  await delay();
  if (simulateError) throw new Error("Failed to load orders");
  return scoped(loadOrders());
}

export async function getPendingOrders(simulateError = false): Promise<DistributorOrder[]> {
  const all = await getOrders(simulateError);
  return all.filter((o) => o.status === "pending_approval");
}

export async function getOrderById(
  id: string,
  simulateError = false,
): Promise<DistributorOrder | null> {
  await delay();
  if (simulateError) throw new Error("Failed to load order");
  return scoped(loadOrders()).find((o) => o.id === id) ?? null;
}

export async function getOrdersByDealer(dealerId: string): Promise<DistributorOrder[]> {
  const all = await getOrders();
  return all.filter((o) => o.dealerId === dealerId);
}

export async function approveOrder(id: string): Promise<DistributorOrder> {
  await delay(400);
  if (getRole() !== "distributor") throw new Error("Unauthorized");
  const orders = loadOrders();
  const idx = orders.findIndex((o) => o.id === id);
  if (idx === -1) throw new Error("Order not found");
  const order = orders[idx]!;
  if (order.status !== "pending_approval") throw new Error("Order is not pending");

  const approved: DistributorOrder = {
    ...order,
    status: "approved",
    approvedAt: nowLabel(),
    pendingHours: 0,
    timeline: [
      ...order.timeline.filter((t) => t.label !== "Pending Distributor Approval"),
      { label: "Approved", at: nowLabel() },
    ],
  };
  orders[idx] = approved;
  saveOrders(orders);
  return approved;
}

export async function rejectOrder(id: string, reason: string): Promise<DistributorOrder> {
  await delay(400);
  if (getRole() !== "distributor") throw new Error("Unauthorized");
  const orders = loadOrders();
  const idx = orders.findIndex((o) => o.id === id);
  if (idx === -1) throw new Error("Order not found");
  const order = orders[idx]!;
  if (order.status !== "pending_approval") throw new Error("Order is not pending");

  const rejected: DistributorOrder = {
    ...order,
    status: "rejected",
    rejectedAt: nowLabel(),
    rejectionReason: reason,
    pendingHours: 0,
    timeline: [
      ...order.timeline.filter((t) => t.label !== "Pending Distributor Approval"),
      { label: "Rejected", at: nowLabel(), note: reason },
    ],
  };
  orders[idx] = rejected;
  saveOrders(orders);
  return rejected;
}

function delay(ms = 280) {
  return new Promise((r) => setTimeout(r, ms));
}
