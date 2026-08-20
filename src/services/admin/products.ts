import { adminStore } from "@/lib/mock/admin/store";
import type { AdminProduct, ListFilters, PaginatedResult } from "@/lib/mock/admin/types";
import { delay, matchesQuery, paginate } from "./_utils";

export type ProductFilters = ListFilters & {
  category?: string;
  status?: "active" | "archived" | "all";
};

export async function listProducts(filters: ProductFilters = {}): Promise<PaginatedResult<AdminProduct>> {
  await delay();
  let items = [...adminStore.products];
  if (filters.category && filters.category !== "all") {
    items = items.filter((p) => p.category === filters.category);
  }
  if (filters.status && filters.status !== "all") {
    items = items.filter((p) => p.status === filters.status);
  }
  if (filters.search) {
    items = items.filter((p) => matchesQuery(filters.search, p.name, p.category, p.guarantee));
  }
  return paginate(items, filters);
}

export async function getProduct(id: string): Promise<AdminProduct | null> {
  await delay();
  return adminStore.products.find((p) => p.id === id) ?? null;
}

export async function saveProduct(product: AdminProduct): Promise<AdminProduct> {
  await delay();
  const idx = adminStore.products.findIndex((p) => p.id === product.id);
  if (idx >= 0) {
    adminStore.products[idx] = product;
  } else {
    adminStore.products.unshift(product);
  }
  return product;
}

export async function archiveProduct(id: string): Promise<void> {
  await delay();
  const p = adminStore.products.find((x) => x.id === id);
  if (p) p.status = "archived";
}

export async function restoreProduct(id: string): Promise<void> {
  await delay();
  const p = adminStore.products.find((x) => x.id === id);
  if (p) p.status = "active";
}

export function getProductCategories(): string[] {
  return [...new Set(adminStore.products.map((p) => p.category))];
}
