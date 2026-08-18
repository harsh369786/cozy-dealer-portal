import { dealer } from "@/lib/demo-data";
import {
  formatCampaignDate,
  getActivePriceCampaigns,
  type PriceCampaign,
} from "@/lib/campaign-service";

const SEEN_CAMPAIGNS_KEY = "backrest_seen_campaigns";
const NOTIFICATIONS_KEY = "backrest_notifications";
const COMPLAINTS_KEY = "backrest_complaints";

export type AppNotification = {
  id: string;
  type: "campaign";
  title: string;
  body: string;
  link: string;
  createdAt: string;
  read: boolean;
  whatsappMessage?: string;
};

export type StoredComplaint = {
  id: string;
  orderId: string;
  description: string;
  status: "Pending";
  submitted: string;
  step: 0;
};

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

export function getSeenCampaignIds(): string[] {
  return readJson<string[]>(SEEN_CAMPAIGNS_KEY, []);
}

export function markCampaignSeen(campaignId: string) {
  const seen = getSeenCampaignIds();
  if (!seen.includes(campaignId)) {
    writeJson(SEEN_CAMPAIGNS_KEY, [...seen, campaignId]);
  }
}

export function getUnseenActiveCampaign(): PriceCampaign | null {
  const seen = getSeenCampaignIds();
  const active = getActivePriceCampaigns();
  return active.find((c) => !seen.includes(c.id)) ?? null;
}

export function buildCampaignWhatsAppMessage(campaign: PriceCampaign, productName: string): string {
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

export function seedCampaignNotifications() {
  const active = getActivePriceCampaigns();
  if (!active.length) return;

  const existing = getNotifications();
  const ids = new Set(existing.map((n) => n.id));

  const seeded: AppNotification[] = active
    .filter((c) => !ids.has(`notif-${c.id}`))
    .map((c) => ({
      id: `notif-${c.id}`,
      type: "campaign" as const,
      title: "New Campaign Live!",
      body: `${c.name} — ${c.badgeLabel ?? "Special offer"} on ${c.productId === "latexo" ? "Latexo" : "selected model"}`,
      link: `/products/${c.productId}`,
      createdAt: new Date().toISOString(),
      read: false,
      whatsappMessage: buildCampaignWhatsAppMessage(
        c,
        c.productId === "latexo" ? "Latexo" : "BackRest",
      ),
    }));

  if (seeded.length) {
    writeJson(NOTIFICATIONS_KEY, [...seeded, ...existing]);
  }
}

export function getNotifications(): AppNotification[] {
  return readJson<AppNotification[]>(NOTIFICATIONS_KEY, []);
}

export function getUnreadNotificationCount(): number {
  return getNotifications().filter((n) => !n.read).length;
}

export function markNotificationRead(id: string) {
  const list = getNotifications().map((n) => (n.id === id ? { ...n, read: true } : n));
  writeJson(NOTIFICATIONS_KEY, list);
}

export function markAllNotificationsRead() {
  const list = getNotifications().map((n) => ({ ...n, read: true }));
  writeJson(NOTIFICATIONS_KEY, list);
}

export function whatsappUrl(phone: string, message: string) {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function getStoredComplaints(): StoredComplaint[] {
  return readJson<StoredComplaint[]>(COMPLAINTS_KEY, []);
}

export function saveComplaint(complaint: StoredComplaint) {
  const list = getStoredComplaints();
  writeJson(COMPLAINTS_KEY, [complaint, ...list]);
}

export function generateComplaintId() {
  return "CMP-" + Math.floor(10000 + Math.random() * 89999);
}

export { dealer };
