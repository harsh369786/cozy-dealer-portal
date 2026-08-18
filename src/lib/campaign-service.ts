import { priceCampaigns, type PriceCampaign } from "@/lib/demo-data";

export type { PriceCampaign };

export function isCampaignActive(campaign: PriceCampaign, at = new Date()): boolean {
  const t = at.getTime();
  return t >= new Date(campaign.startAt).getTime() && t <= new Date(campaign.endAt).getTime();
}

export function getActivePriceCampaign(productId: string, at = new Date()): PriceCampaign | null {
  return priceCampaigns.find((c) => c.productId === productId && isCampaignActive(c, at)) ?? null;
}

export function getActivePriceCampaigns(at = new Date()): PriceCampaign[] {
  return priceCampaigns.filter((c) => isCampaignActive(c, at));
}

export function getCampaignPrice(dealerPrice: number, discountPercent: number): number {
  return Math.round(dealerPrice * (1 - discountPercent / 100));
}

export function getCampaignSavings(dealerPrice: number, campaignPrice: number): number {
  return dealerPrice - campaignPrice;
}

export function formatCampaignDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
