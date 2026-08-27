export type AppNotification = {
  id: string;
  type: "campaign" | "complaint";
  title: string;
  body: string;
  link: string;
  createdAt: string;
  read: boolean;
  metadata?: unknown;
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

const SEEN_CAMPAIGNS_KEY = "backrest_seen_campaigns";

function seenKey(userId?: string) {
  return userId ? `${SEEN_CAMPAIGNS_KEY}:${userId}` : SEEN_CAMPAIGNS_KEY;
}

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

export function getSeenCampaignIds(userId?: string): string[] {
  return readJson<string[]>(seenKey(userId), []);
}

export function markCampaignSeen(campaignId: string, userId?: string) {
  const key = seenKey(userId);
  const seen = readJson<string[]>(key, []);
  if (!seen.includes(campaignId)) {
    writeJson(key, [...seen, campaignId]);
  }
}

export function isCampaignUnseen(campaignId: string, userId?: string): boolean {
  return !getSeenCampaignIds(userId).includes(campaignId);
}

export const dealer = {
  name: "Rajesh",
  shop: "Sharma Furnishings, Nagpur",
  phone: "+91 98765 43210",
};
