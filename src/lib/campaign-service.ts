import type { PriceCampaign } from "@/lib/demo-data";
import { priceCampaigns } from "@/lib/demo-data";
import { api } from "@/lib/api-client";

export type { PriceCampaign };

export function isCampaignActive(campaign: PriceCampaign, at = new Date()): boolean {
  const today = at.toISOString().slice(0, 10);
  const start = campaign.startAt.slice(0, 10);
  const end = campaign.endAt.slice(0, 10);
  return today >= start && today <= end;
}

export function mapApiCampaign(
  productId: string,
  campaign: Record<string, unknown> | null | undefined,
): PriceCampaign | null {
  if (!campaign || !campaign.id) return null;
  return {
    id: String(campaign.id),
    productId,
    name: String(campaign.name ?? "Campaign"),
    discountPercent: Number(campaign.discount_percent ?? campaign.discountPercent ?? 0),
    startAt: String(
      campaign.start_at ?? campaign.startDate ?? campaign.startAt ?? new Date().toISOString(),
    ),
    endAt: String(campaign.end_at ?? campaign.endDate ?? campaign.endAt ?? new Date().toISOString()),
    badgeLabel: String(campaign.badge_label ?? campaign.badgeLabel ?? "Campaign discount"),
    description: String(campaign.description ?? ""),
  };
}

export async function fetchActivePriceCampaign(
  productId: string,
  campaignId?: string,
): Promise<PriceCampaign | null> {
  try {
    const q = campaignId ? `?campaignId=${encodeURIComponent(campaignId)}` : "";
    const detail = await api.get<{ campaign?: Record<string, unknown> | null }>(
      `/api/v1/catalog/products/${productId}${q}`,
    );
    const mapped = mapApiCampaign(productId, detail.campaign);
    return mapped && isCampaignActive(mapped) ? mapped : null;
  } catch {
    return null;
  }
}

export async function fetchPriceQuote(
  productId: string,
  quantity = 1,
  campaignId?: string,
) {
  return api.post<{
    campaign: Record<string, unknown> | null;
    campaignPrice: number | null;
    dealerPrice: number;
    mrp: number;
    unitPrice: number;
  }>("/api/v1/catalog/price-quote", { productId, quantity, campaignId });
}

/** Sync demo helper retained for dealer home preview layout only. */
export function getActivePriceCampaign(productId: string, at = new Date()): PriceCampaign | null {
  return priceCampaigns.find((c) => c.productId === productId && isCampaignActive(c, at)) ?? null;
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
