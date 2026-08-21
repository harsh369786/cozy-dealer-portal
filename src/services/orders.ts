import type { DistributorOrder, OrderStatus } from "@/lib/mock/distributor/types";
import { api } from "@/lib/api-client";

type OrdersQuery = {
  status?: OrderStatus | "order_placed" | "pending_approval";
  search?: string;
  page?: number;
  pageSize?: number;
};

type PaginatedOrdersResponse = {
  items: DistributorOrder[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

function buildOrdersQuery(params: OrdersQuery = {}) {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.search) qs.set("search", params.search);
  if (params.page) qs.set("page", String(params.page));
  if (params.pageSize) qs.set("pageSize", String(params.pageSize));
  const query = qs.toString();
  return query ? `?${query}` : "";
}

export async function getOrders(
  simulateError = false,
  params: OrdersQuery = {},
): Promise<DistributorOrder[]> {
  if (simulateError) throw new Error("Failed to load orders");
  const paginate = params.page != null || params.pageSize != null;
  const res = await api.get<DistributorOrder[] | PaginatedOrdersResponse>(
    `/api/v1/orders${buildOrdersQuery(params)}`,
  );
  if (paginate && res && typeof res === "object" && "items" in res) {
    return res.items;
  }
  return res as DistributorOrder[];
}

export async function listOrdersPage(
  params: OrdersQuery = {},
): Promise<PaginatedOrdersResponse> {
  const res = await api.get<DistributorOrder[] | PaginatedOrdersResponse>(
    `/api/v1/orders${buildOrdersQuery({ page: 1, pageSize: 10, ...params })}`,
  );
  if (res && typeof res === "object" && "items" in res) {
    return res;
  }
  const items = res as DistributorOrder[];
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 10;
  return {
    items,
    total: items.length,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(items.length / pageSize)),
  };
}

export async function getPendingOrders(simulateError = false): Promise<DistributorOrder[]> {
  return getOrders(simulateError, { status: "order_placed" });
}

export async function getOrderById(
  id: string,
  simulateError = false,
): Promise<DistributorOrder | null> {
  if (simulateError) throw new Error("Failed to load order");
  try {
    return await api.get<DistributorOrder>(`/api/v1/orders/${id}`);
  } catch {
    return null;
  }
}

export async function getOrdersByDealer(dealerId: string): Promise<DistributorOrder[]> {
  return api.get<DistributorOrder[]>(`/api/v1/dealers/${dealerId}/orders`);
}

export async function approveOrder(id: string): Promise<DistributorOrder> {
  return api.post<DistributorOrder>(`/api/v1/orders/${id}/approve`);
}

export async function rejectOrder(id: string, reason: string): Promise<DistributorOrder> {
  return api.post<DistributorOrder>(`/api/v1/orders/${id}/reject`, { reason });
}

export async function updateOrderStatus(id: string, status: OrderStatus): Promise<DistributorOrder> {
  return api.patch<DistributorOrder>(`/api/v1/orders/${id}/status`, { status });
}

export async function cancelOrder(id: string, reason?: string): Promise<DistributorOrder> {
  return api.post<DistributorOrder>(`/api/v1/orders/${id}/cancel`, { reason });
}

export async function getOrderStatusOptions(id: string): Promise<OrderStatus[]> {
  const res = await api.get<{ allowed: OrderStatus[] }>(`/api/v1/orders/${id}/status-options`);
  return res.allowed;
}

export async function createDealerOrder(input: Record<string, unknown>): Promise<DistributorOrder> {
  return api.post<DistributorOrder>("/api/v1/orders", input);
}

export type DealerOrderListItem = {
  id: string;
  product: string;
  size: string;
  thickness: string;
  quantity: number;
  dealer: string;
  status: string;
  placed: string;
  amount: number;
  step: number;
  detail: string;
};

function statusStep(status: string): number {
  switch (status) {
    case "order_placed":
    case "pending_approval":
      return 0;
    case "approved":
      return 1;
    case "in_making":
    case "in_production":
      return 2;
    case "out_for_delivery":
      return 3;
    case "delivered":
      return 4;
    case "rejected":
      return 0;
    default:
      return 0;
  }
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    order_placed: "Order Placed",
    pending_approval: "Order Placed",
    approved: "Approved",
    in_making: "In Making",
    in_production: "In Making",
    out_for_delivery: "Out for Delivery",
    delivered: "Delivered",
    rejected: "Rejected",
  };
  return labels[status] ?? status;
}

export async function getDealerOrders(): Promise<DealerOrderListItem[]> {
  const orders = await getOrders();
  return orders.map((o) => {
    const item = o.items[0];
    return {
      id: o.id,
      product: item?.model ?? "Order",
      size: item?.size ?? "",
      thickness: item?.thickness ?? "",
      quantity: o.totalItems,
      dealer: o.storeName ?? o.dealerName,
      status: statusLabel(o.status),
      placed: o.placedAt,
      amount: o.totalValue,
      step: statusStep(o.status),
      detail: o.items.map((i) => `${i.quantity} × ${i.size} × ${i.thickness}`).join(", "),
    };
  });
}

export async function getPriceQuote(input: {
  productId: string;
  quantity: number;
  thickness?: string;
}) {
  return api.post("/api/v1/catalog/price-quote", input);
}
