import type { AdminNotification, AdminNotificationInput, ListFilters, PaginatedResult } from "@/lib/mock/admin/types";
import type { NotificationCategory } from "@/lib/mock/distributor/types";
import { api } from "@/lib/api-client";

export type NotificationFilters = ListFilters & {
  category?: NotificationCategory | "all";
  active?: "all" | "active" | "inactive";
};

type AnnouncementApiRow = AdminNotification & { recipientCount?: number };

const AUDIENCE_LABELS = {
  all_dealers: "All dealers",
  all_distributors: "All distributors",
  all_users: "All users",
  dealers: "Dealers",
  distributors: "Distributors",
  admin_staff: "Admin staff",
} as const;

function qs(filters: NotificationFilters) {
  const params = new URLSearchParams();
  params.set("view", "announcements");
  if (filters.search) params.set("search", filters.search);
  if (filters.category && filters.category !== "all") params.set("category", filters.category);
  if (filters.active && filters.active !== "all") params.set("active", filters.active);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.pageSize) params.set("pageSize", String(filters.pageSize));
  return `?${params.toString()}`;
}

export async function listNotifications(
  filters: NotificationFilters = {},
): Promise<PaginatedResult<AdminNotification>> {
  return api.get<PaginatedResult<AnnouncementApiRow>>(`/api/v1/admin/system-notifications${qs(filters)}`);
}

export async function getNotification(id: string): Promise<AdminNotification | null> {
  try {
    const result = await listNotifications({ page: 1, pageSize: 100 });
    return result.items.find((n) => n.id === id) ?? null;
  } catch {
    return null;
  }
}

export async function composeAnnouncement(input: AdminNotificationInput): Promise<AdminNotification> {
  return api.post<AdminNotification>("/api/v1/admin/system-notifications", input);
}

export async function updateNotification(
  id: string,
  patch: Partial<AdminNotificationInput> & { active?: boolean },
): Promise<AdminNotification> {
  const result = await api.patch<AdminNotification>(`/api/v1/admin/system-notifications/${id}`, patch);
  if (!result) throw new Error("Announcement not found");
  return result;
}

export async function deactivateNotification(id: string): Promise<void> {
  await updateNotification(id, { active: false });
}

export async function activateNotification(id: string): Promise<void> {
  await updateNotification(id, { active: true });
}

export { AUDIENCE_LABELS };
