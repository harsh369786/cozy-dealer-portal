import type { AdminOrderDetail, AdminOrderListItem, ListFilters, PaginatedResult } from "@/lib/mock/admin/types";
import type { DistributorOrder, OrderStatus } from "@/lib/mock/distributor/types";
import { ORDER_STATUS_LABELS } from "@/components/shared/order-timeline";
import { api } from "@/lib/api-client";
import {
  approveOrder as apiApprove,
  cancelOrder as apiCancel,
  getOrderById,
  getOrderStatusOptions,
  getOrders,
  rejectOrder as apiReject,
  updateOrderStatus as apiUpdateStatus,
} from "@/services/orders";
import { delay, paginate } from "./_utils";

export type OrderFilters = ListFilters & {
  status?: OrderStatus | "all";
  distributorId?: string;
};

function toListItem(order: DistributorOrder & { distributorName?: string }): AdminOrderListItem {
  return {
    id: order.id,
    dealerName: order.dealerName,
    dealerCode: order.dealerCode,
    distributorName: order.distributorName ?? "—",
    status: order.status,
    placedAt: order.placedAt,
    totalValue: order.totalValue,
    totalItems: order.totalItems,
  };
}

export async function listOrders(filters: OrderFilters = {}): Promise<PaginatedResult<AdminOrderListItem>> {
  await delay(50);
  let items = await getOrders();
  if (filters.status && filters.status !== "all") {
    items = items.filter((o) => o.status === filters.status);
  }
  if (filters.distributorId) {
    items = items.filter((o) => o.distributorId === filters.distributorId);
  }
  if (filters.search) {
    const q = filters.search.toLowerCase();
    items = items.filter(
      (o) =>
        o.id.toLowerCase().includes(q) ||
        o.dealerName.toLowerCase().includes(q) ||
        o.dealerCode.toLowerCase().includes(q),
    );
  }
  return paginate(items.map(toListItem), filters);
}

export async function getOrder(id: string): Promise<AdminOrderDetail | null> {
  await delay(50);
  const order = await getOrderById(id);
  if (!order) return null;
  return order as AdminOrderDetail;
}

export async function updateOrderStatus(id: string, status: OrderStatus): Promise<void> {
  await apiUpdateStatus(id, status);
}

export async function approveOrder(id: string): Promise<void> {
  await apiApprove(id);
}

export async function rejectOrder(id: string, reason: string): Promise<void> {
  await apiReject(id, reason);
}

export async function cancelOrder(id: string, reason?: string): Promise<void> {
  await apiCancel(id, reason);
}

export async function fetchAllowedStatuses(orderId: string): Promise<OrderStatus[]> {
  return getOrderStatusOptions(orderId);
}

export const ORDER_STATUS_OPTIONS: OrderStatus[] = [
  "order_placed",
  "approved",
  "in_making",
  "out_for_delivery",
  "delivered",
  "rejected",
  "cancelled",
];

export { ORDER_STATUS_LABELS };
