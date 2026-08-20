import { api } from "@/lib/api-client";

export type CatalogProduct = {
  id: string;
  name: string;
  category: string;
  guarantee: string;
  fixed_size?: string;
  blurb?: string;
  image_url?: string;
  thicknesses?: string[];
  mrp?: number;
  price?: number;
  points?: number;
  free?: string;
};

export type CatalogResponse = {
  mattressLayers: Array<{
    id: string;
    title: string;
    productIds?: string[];
    subgroups?: Array<{ label: string; productIds: string[] }>;
  }>;
  foldable: CatalogProduct[];
  pillows: CatalogProduct[];
  products: CatalogProduct[];
};

export async function getCatalog(): Promise<CatalogResponse> {
  return api.get<CatalogResponse>("/api/v1/catalog");
}

export async function getProductDetail(id: string) {
  return api.get(`/api/v1/catalog/products/${id}`);
}

export async function getSalespeople() {
  return api.get<Array<{ id: string; name: string }>>("/api/v1/dealer/salespeople");
}
