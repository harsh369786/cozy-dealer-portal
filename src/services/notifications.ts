import type { DistributorNotification, NotificationCategory } from "@/lib/mock/distributor/types";
import { DISTRIBUTOR_ID, seedNotifications } from "@/lib/mock/distributor/data";

const STORAGE_KEY = "backrest-distributor-notifications";

function loadNotifications(): DistributorNotification[] {
  if (typeof window === "undefined") return [...seedNotifications];
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seedNotifications));
    return [...seedNotifications];
  }
  try {
    return JSON.parse(raw) as DistributorNotification[];
  } catch {
    return [...seedNotifications];
  }
}

function saveNotifications(notifications: DistributorNotification[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
}

export async function getNotifications(simulateError = false): Promise<DistributorNotification[]> {
  await delay();
  if (simulateError) throw new Error("Failed to load notifications");
  return loadNotifications()
    .filter((n) => n.distributorId === DISTRIBUTOR_ID)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function getUnreadCount(): Promise<number> {
  const all = await getNotifications();
  return all.filter((n) => !n.read).length;
}

export async function markNotificationRead(id: string): Promise<void> {
  await delay(150);
  const all = loadNotifications();
  const idx = all.findIndex((n) => n.id === id);
  if (idx !== -1) {
    all[idx] = { ...all[idx]!, read: true };
    saveNotifications(all);
  }
}

export async function markAllRead(): Promise<void> {
  await delay(200);
  const all = loadNotifications().map((n) =>
    n.distributorId === DISTRIBUTOR_ID ? { ...n, read: true } : n,
  );
  saveNotifications(all);
}

export async function getNotificationsByCategory(
  category: NotificationCategory | "all",
): Promise<DistributorNotification[]> {
  const all = await getNotifications();
  if (category === "all") return all;
  return all.filter((n) => n.category === category);
}

function delay(ms = 280) {
  return new Promise((r) => setTimeout(r, ms));
}
