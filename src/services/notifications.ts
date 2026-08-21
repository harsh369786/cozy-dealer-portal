import type { DistributorNotification, NotificationCategory } from "@/lib/mock/distributor/types";
import { invalidateUnreadCountCache } from "@/lib/notification-count-cache";
import { api } from "@/lib/api-client";

type ApiNotification = {
  id: string;
  category: NotificationCategory;
  type: string;
  title: string;
  body: string;
  link: string;
  createdAt: string;
  read: boolean;
  isReminder?: boolean;
};

function mapNotification(n: ApiNotification): DistributorNotification {
  return {
    id: n.id,
    distributorId: "",
    category: n.category,
    type: n.type as DistributorNotification["type"],
    title: n.title,
    body: n.body,
    link: n.link,
    createdAt: n.createdAt,
    read: n.read,
    isReminder: n.isReminder,
  };
}

export async function getNotifications(simulateError = false): Promise<DistributorNotification[]> {
  if (simulateError) throw new Error("Failed to load notifications");
  const list = await api.get<ApiNotification[]>("/api/v1/notifications");
  return list.map(mapNotification);
}

export async function getUnreadCount(): Promise<number> {
  const all = await getNotifications();
  return all.filter((n) => !n.read).length;
}

export async function markNotificationRead(id: string): Promise<void> {
  await api.patch(`/api/v1/notifications/${id}/read`);
  invalidateUnreadCountCache();
}

export async function markAllRead(): Promise<void> {
  await api.post("/api/v1/notifications/read-all");
  invalidateUnreadCountCache();
}

export async function getNotificationsByCategory(
  category: NotificationCategory | "all",
): Promise<DistributorNotification[]> {
  const all = await getNotifications();
  if (category === "all") return all;
  return all.filter((n) => n.category === category);
}
