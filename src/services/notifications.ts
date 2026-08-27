import type { DistributorNotification, NotificationCategory } from "@/lib/mock/distributor/types";
import { requestUnreadCountRefresh } from "@/lib/notification-count-cache";
import { api } from "@/lib/api-client";

export type NotificationRow = {
  id: string;
  category: NotificationCategory;
  type: string;
  title: string;
  body: string;
  link: string;
  createdAt: string;
  createdAtLabel?: string;
  read: boolean;
  isReminder?: boolean;
  metadata?: Record<string, unknown>;
};

type ApiNotification = NotificationRow;

function mapNotification(n: ApiNotification): DistributorNotification {
  return {
    id: n.id,
    category: n.category,
    type: n.type as DistributorNotification["type"],
    title: n.title,
    body: n.body,
    link: n.link ?? "",
    createdAt: n.createdAtLabel ?? n.createdAt,
    read: n.read,
    isReminder: n.isReminder,
    metadata: n.metadata,
  };
}

export async function getNotifications(simulateError = false): Promise<DistributorNotification[]> {
  if (simulateError) throw new Error("Failed to load notifications");
  const list = await api.get<ApiNotification[]>("/api/v1/notifications");
  return list.map(mapNotification);
}

export async function getNotificationsSince(since?: string): Promise<NotificationRow[]> {
  const path = since
    ? `/api/v1/notifications?since=${encodeURIComponent(since)}`
    : "/api/v1/notifications";
  return api.get<NotificationRow[]>(path);
}

export async function getUnreadCount(): Promise<number> {
  const res = await api.get<{ count: number }>("/api/v1/notifications/unread-count");
  return res.count;
}

export async function markNotificationRead(id: string): Promise<void> {
  await api.patch(`/api/v1/notifications/${id}/read`);
  requestUnreadCountRefresh();
}

export async function markAllRead(): Promise<void> {
  await api.post("/api/v1/notifications/read-all");
  requestUnreadCountRefresh();
}

export async function getNotificationsByCategory(
  category: NotificationCategory | "all",
): Promise<DistributorNotification[]> {
  const all = await getNotifications();
  if (category === "all") return all;
  return all.filter((n) => n.category === category);
}
