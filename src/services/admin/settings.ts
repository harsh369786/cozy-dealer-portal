import type { SystemSetting } from "@/lib/mock/admin/types";
import { api } from "@/lib/api-client";

const SETTING_META: Record<string, Omit<SystemSetting, "key" | "value">> = {
  otp_expiry_minutes: {
    label: "OTP expiry (minutes)",
    group: "otp",
    description: "How long an OTP code remains valid.",
  },
  order_reminder_hours: {
    label: "Order reminder threshold (hours)",
    group: "reminders",
    description: "Pending orders older than this trigger reminders.",
  },
  rewards_enabled: {
    label: "Rewards programme",
    group: "features",
    description: "Enable dealer reward points and redemptions.",
  },
  whatsapp_notifications: {
    label: "WhatsApp notifications",
    group: "notifications",
    description: "Send order updates via WhatsApp when configured.",
  },
};

function mapSetting(row: { key: string; value: string }): SystemSetting {
  const meta = SETTING_META[row.key] ?? {
    label: row.key.replace(/_/g, " "),
    group: "features" as const,
  };
  return {
    key: row.key,
    value: row.value,
    ...meta,
  };
}

export async function getSettings(): Promise<SystemSetting[]> {
  const rows = await api.get<Array<{ key: string; value: string }>>("/api/v1/admin/settings");
  return rows.map(mapSetting);
}

export async function updateSetting(key: string, value: string): Promise<void> {
  await api.patch(`/api/v1/admin/settings/${encodeURIComponent(key)}`, { value });
}
