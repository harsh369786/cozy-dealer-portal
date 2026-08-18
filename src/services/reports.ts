import type { DashboardStats, MonthlySales, ProductSales } from "@/lib/mock/distributor/types";
import { computeDashboardStats, monthlySales, productSales } from "@/lib/mock/distributor/data";

export async function getDashboardStats(simulateError = false): Promise<DashboardStats> {
  await delay();
  if (simulateError) throw new Error("Failed to load dashboard");
  return computeDashboardStats();
}

export async function getMonthlySales(simulateError = false): Promise<MonthlySales[]> {
  await delay();
  if (simulateError) throw new Error("Failed to load sales data");
  return monthlySales;
}

export async function getProductSales(simulateError = false): Promise<ProductSales[]> {
  await delay();
  if (simulateError) throw new Error("Failed to load product sales");
  return productSales;
}

function delay(ms = 280) {
  return new Promise((r) => setTimeout(r, ms));
}
