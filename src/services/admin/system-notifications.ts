import { api } from "@/lib/api-client";

export type SystemNotification = {
  id: string;
  recipient_user_id: string;
  recipient_name?: string;
  category: string;
  type: string;
  title: string;
  body: string;
  link?: string;
  read: number;
  created_at: string;
};

export async function listSystemNotifications(category?: string) {
  const params = new URLSearchParams({ pageSize: "50" });
  if (category && category !== "all") params.set("category", category);
  const res = await api.get<{ items: SystemNotification[] }>(
    `/api/v1/admin/system-notifications?${params.toString()}`,
  );
  return res.items ?? [];
}

export async function updateSystemNotification(id: string, input: { title?: string; body?: string }) {
  return api.patch(`/api/v1/admin/system-notifications/${id}`, input);
}

export async function deleteSystemNotification(id: string) {
  return api.delete(`/api/v1/admin/system-notifications/${id}`);
}
