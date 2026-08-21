import type { AdminOrderDetail, AdminOrderListItem, ListFilters, PaginatedResult } from "@/lib/mock/admin/types";
import type { DistributorOrder, OrderStatus } from "@/lib/mock/distributor/types";
import { ORDER_STATUS_LABELS } from "@/components/shared/order-timeline";
import {
  approveOrder as apiApprove,
  cancelOrder as apiCancel,
  getOrderById,
  getOrderStatusOptions,
  listOrdersPage,
  rejectOrder as apiReject,
  updateOrderStatus as apiUpdateStatus,
} from "@/services/orders";
import { delay } from "./_utils";

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
  await delay(0);
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = filters.pageSize ?? 10;
  const result = await listOrdersPage({
    page,
    pageSize,
    search: filters.search,
    status: filters.status && filters.status !== "all" ? filters.status : undefined,
  });

  let items = result.items;
  if (filters.distributorId) {
    items = items.filter((o) => o.distributorId === filters.distributorId);
  }

  return {
    items: items.map(toListItem),
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    totalPages: result.totalPages,
  };
}

export async function getOrder(id: string): Promise<AdminOrderDetail | null> {
  await delay(0);
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
