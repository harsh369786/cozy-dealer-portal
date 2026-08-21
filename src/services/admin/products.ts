import type { AdminProduct, PaginatedResult } from "@/lib/mock/admin/types";
import { api } from "@/lib/api-client";

export type ProductFilters = {
  search?: string;
  category?: string;
  status?: "active" | "archived" | "all";
  page?: number;
  pageSize?: number;
};

function qs(filters: ProductFilters) {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.category && filters.category !== "all") params.set("category", filters.category);
  if (filters.status && filters.status !== "all") params.set("status", filters.status);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.pageSize) params.set("pageSize", String(filters.pageSize));
  const q = params.toString();
  return q ? `?${q}` : "";
}

function toApiInput(product: AdminProduct) {
  return {
    id: product.id,
    name: product.name,
    category: product.category,
    guarantee: product.guarantee,
    thicknesses: product.thicknesses,
    fixedSize: product.fixedSize ?? null,
    mrp: product.mrp,
    dealerPrice: product.dealerPrice,
    points: product.points,
    rewardPercent: product.rewardPercent,
    rewardEligibility: product.rewardEligibility,
    freeItems: product.freeItems ?? null,
    blurb: product.blurb,
    image: product.image,
  };
}

export async function listProducts(filters: ProductFilters = {}): Promise<PaginatedResult<AdminProduct>> {
  return api.get(`/api/v1/admin/products${qs(filters)}`);
}

export async function getProduct(id: string): Promise<AdminProduct | null> {
  try {
    return await api.get<AdminProduct>(`/api/v1/admin/products/${id}`);
  } catch {
    return null;
  }
}

export async function saveProduct(product: AdminProduct): Promise<AdminProduct> {
  const body = toApiInput(product);
  const existing = await getProduct(product.id);
  if (existing) {
    return api.patch(`/api/v1/admin/products/${product.id}`, body);
  }
  return api.post("/api/v1/admin/products", body);
}

export async function archiveProduct(id: string): Promise<void> {
  await api.patch(`/api/v1/admin/products/${id}/archive`);
}

export async function restoreProduct(id: string): Promise<void> {
  await api.patch(`/api/v1/admin/products/${id}/restore`);
}

export async function getProductCategories(): Promise<string[]> {
  const result = await listProducts({ pageSize: 100 });
  return [...new Set(result.items.map((p) => p.category))];
}
