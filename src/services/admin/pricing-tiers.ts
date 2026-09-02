import { api } from "@/lib/api-client";

export type PricingTier = {
  id: string;
  code: string;
  name: string;
  distributorMarginPercent: number;
  sortOrder: number;
};

export function listPricingTiers() {
  return api.get<{ items: PricingTier[] }>("/api/v1/admin/pricing-tiers");
}

export function createPricingTier(input: { code: string; name: string; distributorMarginPercent: number }) {
  return api.post<PricingTier>("/api/v1/admin/pricing-tiers", input);
}

export function updatePricingTier(
  id: string,
  input: { code: string; name: string; distributorMarginPercent: number },
) {
  return api.patch<PricingTier>(`/api/v1/admin/pricing-tiers/${id}`, input);
}

export function deletePricingTier(id: string) {
  return api.delete(`/api/v1/admin/pricing-tiers/${id}`);
}
