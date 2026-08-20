import { adminStore } from "@/lib/mock/admin/store";
import type { AdminCampaign, CampaignType, ListFilters, PaginatedResult } from "@/lib/mock/admin/types";
import { delay, matchesQuery, paginate } from "./_utils";

export type CampaignFilters = ListFilters & {
  type?: CampaignType | "all";
  status?: string;
  active?: "all" | "active" | "inactive";
};

function dispatchCampaignNotifications(campaign: AdminCampaign, isUpdate: boolean) {
  const stamp = Date.now();
  if (campaign.whatsappTargetDealers) {
    for (const dealer of adminStore.dealers.filter((d) => d.active)) {
      adminStore.whatsappOutbox.push({
        id: `wa-camp-${campaign.id}-dealer-${dealer.id}-${stamp}`,
        toPhone: dealer.phone,
        templateKey: "campaign_announcement",
        sentAt: new Date().toISOString(),
      });
    }
  }
  if (campaign.whatsappTargetDistributors) {
    for (const user of adminStore.users.filter((u) => u.role === "distributor")) {
      adminStore.whatsappOutbox.push({
        id: `wa-camp-${campaign.id}-dist-${user.id}-${stamp}`,
        toPhone: user.phone,
        templateKey: "campaign_announcement",
        sentAt: new Date().toISOString(),
      });
    }
  }

  adminStore.notifications.unshift({
    id: `notif-camp-${campaign.id}-${stamp}`,
    category: "campaigns",
    title: isUpdate ? `Campaign updated: ${campaign.name}` : `New campaign: ${campaign.name}`,
    body: campaign.description,
    recipientScope: "All relevant users (in-app)",
    audience: "all_users",
    read: false,
    active: true,
    sendAt: new Date().toISOString(),
    popupEnabled: true,
    maxImpressions: 3,
    impressionCount: 0,
    createdAt: new Date().toLocaleString("en-IN"),
    whatsappTargetDealers: campaign.whatsappTargetDealers,
    whatsappTargetDistributors: campaign.whatsappTargetDistributors,
  });
}

export async function listCampaigns(filters: CampaignFilters = {}): Promise<PaginatedResult<AdminCampaign>> {
  await delay();
  let items = [...adminStore.campaigns];
  if (filters.type && filters.type !== "all") {
    items = items.filter((c) => c.type === filters.type);
  }
  if (filters.status && filters.status !== "all") {
    items = items.filter((c) => c.status === filters.status);
  }
  if (filters.active === "active") {
    items = items.filter((c) => c.active);
  }
  if (filters.active === "inactive") {
    items = items.filter((c) => !c.active);
  }
  if (filters.search) {
    items = items.filter((c) => matchesQuery(filters.search, c.name, c.product, c.description));
  }
  return paginate(items, filters);
}

export async function getCampaign(id: string): Promise<AdminCampaign | null> {
  await delay();
  return adminStore.campaigns.find((c) => c.id === id) ?? null;
}

export async function saveCampaign(campaign: AdminCampaign): Promise<AdminCampaign> {
  await delay();
  const withDefaults: AdminCampaign = {
    whatsappTargetDealers: true,
    whatsappTargetDistributors: false,
    ...campaign,
    active: campaign.active ?? true,
  };
  const idx = adminStore.campaigns.findIndex((c) => c.id === withDefaults.id);
  const isUpdate = idx >= 0;
  if (isUpdate) {
    adminStore.campaigns[idx] = withDefaults;
  } else {
    adminStore.campaigns.unshift(withDefaults);
  }
  dispatchCampaignNotifications(withDefaults, isUpdate);
  return withDefaults;
}

export async function deactivateCampaign(id: string): Promise<void> {
  await delay();
  const campaign = adminStore.campaigns.find((c) => c.id === id);
  if (!campaign) throw new Error("Campaign not found");
  campaign.active = false;
  campaign.status = "expired";
}

export async function activateCampaign(id: string): Promise<void> {
  await delay();
  const campaign = adminStore.campaigns.find((c) => c.id === id);
  if (!campaign) throw new Error("Campaign not found");
  campaign.active = true;
  if (campaign.status === "expired") campaign.status = "active";
}

export async function deleteCampaign(id: string): Promise<void> {
  await delay();
  const idx = adminStore.campaigns.findIndex((c) => c.id === id);
  if (idx >= 0) adminStore.campaigns.splice(idx, 1);
}
