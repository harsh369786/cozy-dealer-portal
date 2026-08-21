import type { AdminNotification, AdminNotificationInput, ListFilters, PaginatedResult } from "@/lib/mock/admin/types";
import type { NotificationCategory } from "@/lib/mock/distributor/types";
import { matchesQuery, paginate } from "./_utils";

export type NotificationFilters = ListFilters & {
  category?: NotificationCategory | "all";
  active?: "all" | "active" | "inactive";
};

const AUDIENCE_LABELS: Record<AdminNotification["audience"], string> = {
  all_dealers: "All dealers",
  all_distributors: "All distributors",
  all_users: "All users",
  dealers: "Dealers",
  distributors: "Distributors",
  admin_staff: "Admin staff",
};

function scopeForAudience(audience: AdminNotification["audience"]) {
  return AUDIENCE_LABELS[audience];
}

async function getStoreNotifications() {
  const { adminStore } = await import("@/lib/mock/admin/store");
  return adminStore.notifications;
}

export async function listNotifications(
  filters: NotificationFilters = {},
): Promise<PaginatedResult<AdminNotification>> {
  let items = [...(await getStoreNotifications())];
  if (filters.category && filters.category !== "all") {
    items = items.filter((n) => n.category === filters.category);
  }
  if (filters.active === "active") items = items.filter((n) => n.active);
  if (filters.active === "inactive") items = items.filter((n) => !n.active);
  if (filters.search) {
    items = items.filter((n) => matchesQuery(filters.search, n.title, n.body, n.recipientScope));
  }
  return paginate(items, filters);
}

export async function getNotification(id: string): Promise<AdminNotification | null> {
  const items = await getStoreNotifications();
  return items.find((n) => n.id === id) ?? null;
}

export async function composeAnnouncement(input: AdminNotificationInput): Promise<AdminNotification> {
  const { adminStore } = await import("@/lib/mock/admin/store");
  const notification: AdminNotification = {
    id: `ntf-${Date.now()}`,
    category: input.category,
    title: input.title,
    body: input.body,
    audience: input.audience,
    recipientScope: scopeForAudience(input.audience),
    read: false,
    active: true,
    sendAt: input.sendAt,
    popupEnabled: input.popupEnabled,
    maxImpressions: input.maxImpressions,
    impressionCount: 0,
    createdAt: new Date().toLocaleString("en-IN"),
  };
  adminStore.notifications.unshift(notification);
  return notification;
}

export async function updateNotification(
  id: string,
  patch: Partial<AdminNotificationInput> & { active?: boolean },
): Promise<AdminNotification> {
  const { adminStore } = await import("@/lib/mock/admin/store");
  const n = adminStore.notifications.find((x) => x.id === id);
  if (!n) throw new Error("Notification not found");

  if (patch.title !== undefined) n.title = patch.title;
  if (patch.body !== undefined) n.body = patch.body;
  if (patch.category !== undefined) n.category = patch.category;
  if (patch.audience !== undefined) {
    n.audience = patch.audience;
    n.recipientScope = scopeForAudience(patch.audience);
  }
  if (patch.sendAt !== undefined) n.sendAt = patch.sendAt;
  if (patch.popupEnabled !== undefined) n.popupEnabled = patch.popupEnabled;
  if (patch.maxImpressions !== undefined) n.maxImpressions = patch.maxImpressions;
  if (patch.active !== undefined) n.active = patch.active;

  return n;
}

export async function deactivateNotification(id: string): Promise<void> {
  await updateNotification(id, { active: false });
}

export async function activateNotification(id: string): Promise<void> {
  await updateNotification(id, { active: true });
}

export { AUDIENCE_LABELS };
