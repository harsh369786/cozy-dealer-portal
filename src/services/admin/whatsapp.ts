import { api } from "@/lib/api-client";

export type WhatsappMessage = {
  id: string;
  toPhone: string;
  templateKey: string;
  businessEvent: string | null;
  referenceId: string | null;
  status: string;
  providerMessageId: string | null;
  error: string | null;
  attempts: number;
  scheduledAt: string;
  sentAt: string | null;
};

export type WhatsappOutboxResponse = {
  configured: boolean;
  templates: string[];
  messages: WhatsappMessage[];
};

export async function getWhatsappOutbox(params: { status?: string; limit?: number } = {}): Promise<WhatsappOutboxResponse> {
  const qs = new URLSearchParams();
  if (params.status && params.status !== "all") qs.set("status", params.status);
  if (params.limit) qs.set("limit", String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return api.get<WhatsappOutboxResponse>(`/api/v1/admin/whatsapp/outbox${suffix}`);
}

export async function sendWhatsappTest(input: { templateKey: string; phone?: string }): Promise<{ ok: boolean; error?: string; providerMessageId?: string | null }> {
  return api.post("/api/v1/admin/whatsapp/test", input);
}
