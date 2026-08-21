import type { DashboardStats, MonthlySales, ProductSales } from "@/lib/mock/distributor/types";
import { api } from "@/lib/api-client";

export async function getDashboardStats(simulateError = false): Promise<DashboardStats> {
  if (simulateError) throw new Error("Failed to load dashboard");
  return api.get<DashboardStats>("/api/v1/reports/dashboard");
}

export async function getMonthlySales(simulateError = false): Promise<MonthlySales[]> {
  if (simulateError) throw new Error("Failed to load sales data");
  return api.get<MonthlySales[]>("/api/v1/reports/monthly-sales");
}

export async function getProductSales(simulateError = false): Promise<ProductSales[]> {
  if (simulateError) throw new Error("Failed to load product sales");
  return api.get<ProductSales[]>("/api/v1/reports/product-sales");
}

export async function getDealerPerformance(simulateError = false) {
  if (simulateError) throw new Error("Failed to load dealer performance");
  return api.get<{
    currentMonth: string;
    previousMonth: string;
    dealers: import("@/lib/mock/distributor/types").DealerPerformanceRow[];
  }>("/api/v1/reports/dealer-performance");
}
