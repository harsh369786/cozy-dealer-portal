import type { AdminCampaign, PaginatedResult } from "@/lib/mock/admin/types";
import { api } from "@/lib/api-client";

export type CampaignFilters = {
  search?: string;
  status?: string;
  active?: "all" | "active" | "inactive";
  page?: number;
  pageSize?: number;
};

function qs(filters: CampaignFilters) {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status && filters.status !== "all") params.set("status", filters.status);
  if (filters.active && filters.active !== "all") params.set("active", filters.active);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.pageSize) params.set("pageSize", String(filters.pageSize));
  const q = params.toString();
  return q ? `?${q}` : "";
}

function toApiInput(campaign: AdminCampaign) {
  return {
    id: campaign.id,
    name: campaign.name,
    productId: campaign.productId,
    product: campaign.product,
    discountPercent: campaign.discountPercent,
    description: campaign.description,
    badgeLabel: campaign.badgeLabel,
    startDate: campaign.startDate,
    endDate: campaign.endDate,
    status: campaign.storedStatus ?? campaign.status,
    active: campaign.active,
    whatsappTargetDealers: campaign.whatsappTargetDealers,
    whatsappTargetDistributors: campaign.whatsappTargetDistributors,
    imageUrl: campaign.imageUrl ?? null,
  };
}

export async function listCampaigns(filters: CampaignFilters = {}): Promise<PaginatedResult<AdminCampaign>> {
  return api.get(`/api/v1/admin/campaigns${qs(filters)}`);
}

export async function getCampaign(id: string): Promise<AdminCampaign | null> {
  try {
    return await api.get<AdminCampaign>(`/api/v1/admin/campaigns/${id}`);
  } catch {
    return null;
  }
}

export async function saveCampaign(campaign: AdminCampaign): Promise<AdminCampaign> {
  const body = toApiInput(campaign);
  const existing = await getCampaign(campaign.id);
  if (existing) {
    return api.patch(`/api/v1/admin/campaigns/${campaign.id}`, body);
  }
  return api.post("/api/v1/admin/campaigns", body);
}

export async function deactivateCampaign(id: string): Promise<void> {
  await api.patch(`/api/v1/admin/campaigns/${id}/archive`);
}

export async function activateCampaign(id: string): Promise<void> {
  await api.patch(`/api/v1/admin/campaigns/${id}/activate`);
}

export async function deleteCampaign(id: string): Promise<void> {
  await deactivateCampaign(id);
}
