import { api } from "@/lib/api-client";

export type SqftRate = {
  guarantee: string;
  thickness: string;
  mrpPerSqft: number;
  dealerPerSqft: number;
  rewardPercent: number;
  effectiveFrom: string;
};

export async function listSqftRates() {
  return api.get<SqftRate[]>("/api/v1/admin/pricing/sqft-rates");
}

export async function saveSqftRate(input: SqftRate) {
  return api.put<SqftRate>("/api/v1/admin/pricing/sqft-rates", input);
}

export async function deleteSqftRate(guarantee: string, thickness: string) {
  return api.delete(
    `/api/v1/admin/pricing/sqft-rates?guarantee=${encodeURIComponent(guarantee)}&thickness=${encodeURIComponent(thickness)}`,
  );
}

export async function recalculateCatalogPrices() {
  return api.post<{ updated: number; rateCount: number }>("/api/v1/admin/pricing/sqft-rates/recalculate");
}
