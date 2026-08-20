export type AppNotification = {
  id: string;
  type: "campaign" | "complaint";
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

const SEEN_CAMPAIGNS_KEY = "backrest_seen_campaigns";

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

export const dealer = {
  name: "Rajesh",
  shop: "Sharma Furnishings, Nagpur",
  phone: "+91 98765 43210",
};
