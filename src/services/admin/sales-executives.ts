import { api } from "@/lib/api-client";

export type SalesExecutiveRow = {
  id: string;
  name: string;
  phone: string;
  status: string;
  distributorId: string | null;
  distributorName: string | null;
  dealerCount: number;
  totalVisits: number;
  visitsThisMonth: number;
  totalOrders: number;
  pendingOrders: number;
  deliveredOrders: number;
  salesValue: number;
};

export type SalesExecutiveDetail = SalesExecutiveRow & {
  dealers: Array<{
    id: string;
    storeName: string;
    code: string;
    location: string;
    active: boolean;
  }>;
  recentVisits: Array<{
    id: string;
    dealerName: string;
    storeName: string;
    status: string;
    checkInAt: string;
    checkOutAt: string | null;
    durationMinutes: number | null;
  }>;
};

export async function listSalesExecutives() {
  return api.get<{ items: SalesExecutiveRow[] }>("/api/v1/admin/sales-executives");
}

export async function getSalesExecutive(id: string) {
  return api.get<SalesExecutiveDetail>(`/api/v1/admin/sales-executives/${id}`);
}
