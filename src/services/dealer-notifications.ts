import type { AppNotification } from "@/lib/notifications";
import { api } from "@/lib/api-client";
import { formatCampaignDate } from "@/lib/campaign-service";

export async function getDealerNotifications(): Promise<AppNotification[]> {
  const list = await api.get<
    Array<{
      id: string;
      type: string;
      title: string;
      body: string;
      link: string;
      createdAt: string;
      read: boolean;
    }>
  >("/api/v1/notifications");

  return list.map((n) => ({
    id: n.id,
    type: n.type === "complaint" ? "complaint" : "campaign",
    title: n.title,
    body: n.body,
    link: n.link,
    createdAt: n.createdAt,
    read: n.read,
  }));
}

export async function getUnreadNotificationCount(): Promise<number> {
  const list = await getDealerNotifications();
  return list.filter((n) => !n.read).length;
}

export async function markNotificationRead(id: string) {
  await api.patch(`/api/v1/notifications/${id}/read`);
}

export async function markAllNotificationsRead() {
  await api.post("/api/v1/notifications/read-all");
}

export function buildCampaignWhatsAppMessage(
  campaign: { name: string; discountPercent: number; startAt: string; endAt: string },
  productName: string,
): string {
  return [
    "🔥 *New BackRest Campaign*",
    "",
    campaign.name,
    `*${productName} Mattress*`,
    "",
    `Get an *extra ${campaign.discountPercent}% OFF* during the campaign period.`,
    "",
    `Valid from ${formatCampaignDate(campaign.startAt)} – ${formatCampaignDate(campaign.endAt)}.`,
    "",
    "Tap to view the campaign and order.",
  ].join("\n");
}
