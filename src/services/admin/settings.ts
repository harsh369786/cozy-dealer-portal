import { adminStore } from "@/lib/mock/admin/store";
import type { SystemSetting } from "@/lib/mock/admin/types";
import { delay } from "./_utils";

export async function getSettings(): Promise<SystemSetting[]> {
  await delay();
  return [...adminStore.settings];
}

export async function updateSetting(key: string, value: string): Promise<void> {
  await delay();
  const setting = adminStore.settings.find((s) => s.key === key);
  if (setting) setting.value = value;
}
