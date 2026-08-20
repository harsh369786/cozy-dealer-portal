import type { DistributorCampaign } from "@/lib/mock/distributor/types";
import { api } from "@/lib/api-client";

export async function getCampaigns(
  simulateError = false,
  tab?: string,
): Promise<DistributorCampaign[]> {
  if (simulateError) throw new Error("Failed to load campaigns");
  const q = tab ? `?tab=${encodeURIComponent(tab)}` : "";
  return api.get<DistributorCampaign[]>(`/api/v1/distributor/campaigns${q}`);
}

export async function getCampaignById(
  id: string,
  simulateError = false,
): Promise<DistributorCampaign | null> {
  if (simulateError) throw new Error("Failed to load campaign");
  const all = await getCampaigns();
  return all.find((c) => c.id === id) ?? null;
}

export async function getSellCampaigns(tab?: string) {
  const q = tab ? `?tab=${encodeURIComponent(tab)}` : "";
  return api.get(`/api/v1/campaigns${q}`);
}
