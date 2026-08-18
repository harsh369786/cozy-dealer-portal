import type { DistributorCampaign } from "@/lib/mock/distributor/types";
import { DISTRIBUTOR_ID, seedCampaigns } from "@/lib/mock/distributor/data";

export async function getCampaigns(simulateError = false): Promise<DistributorCampaign[]> {
  await delay();
  if (simulateError) throw new Error("Failed to load campaigns");
  return seedCampaigns.filter((c) => c.distributorId === DISTRIBUTOR_ID);
}

export async function getCampaignById(
  id: string,
  simulateError = false,
): Promise<DistributorCampaign | null> {
  await delay();
  if (simulateError) throw new Error("Failed to load campaign");
  return seedCampaigns.find((c) => c.id === id && c.distributorId === DISTRIBUTOR_ID) ?? null;
}

function delay(ms = 280) {
  return new Promise((r) => setTimeout(r, ms));
}
