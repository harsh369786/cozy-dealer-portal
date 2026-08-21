import type { DistributorCampaign } from "@/lib/mock/distributor/types";
import type { CampaignStatus } from "@/lib/mock/distributor/types";
import { api } from "@/lib/api-client";

export type DealerCampaign = {
  id: string;
  name: string;
  productId?: string;
  productName?: string;
  discountPercent?: number;
  description: string;
  badgeLabel?: string;
  startDate: string;
  endDate: string;
  status: CampaignStatus;
  imageUrl?: string;
  target?: number;
  done?: number;
};

export type DealerCampaignsResponse = {
  campaigns: DealerCampaign[];
};

export async function getCampaigns(
  simulateError = false,
  tab?: CampaignStatus,
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
  try {
    const campaign = await api.get<DealerCampaign>(`/api/v1/campaigns/${id}`);
    return {
      id: campaign.id,
      distributorId: "",
      name: campaign.name,
      product: campaign.productName ?? "All products",
      productId: campaign.productId,
      discountLabel:
        campaign.badgeLabel ??
        (campaign.discountPercent ? `${campaign.discountPercent}% off` : "Campaign offer"),
      description: campaign.description,
      startDate: campaign.startDate,
      endDate: campaign.endDate,
      status: campaign.status,
      bannerEmoji: "📣",
      imageUrl: campaign.imageUrl,
    };
  } catch {
    return null;
  }
}

export async function getDealerCampaigns(tab?: CampaignStatus): Promise<DealerCampaignsResponse> {
  const q = tab ? `?tab=${encodeURIComponent(tab)}` : "";
  return api.get<DealerCampaignsResponse>(`/api/v1/campaigns${q}`);
}
