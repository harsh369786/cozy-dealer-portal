// The ONE place that talks to the Gupshup WhatsApp API. Every WhatsApp send (OTP, order events,
// campaign) ultimately goes through sendGupshupTemplate. No other module builds a Gupshup request.
//
// Wire format (confirmed):
//   POST {base}/wa/api/v1/template/msg   Content-Type: application/x-www-form-urlencoded
//   header: apikey: <GUPSHUP_API_KEY>
//   body:   channel=whatsapp & source=<digits> & destination=<digits> & src.name=<app>
//           & template={"id":"<uuid>","params":[...]}
//
// Never logs the API key or OTP values. Never throws into a business flow — always returns a result.

import type { ApiEnv } from "../types";

export type GupshupSendResult =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; error: string };

/** True when Gupshup is configured enough to attempt a send (API key + source present). */
export function isGupshupConfigured(env: ApiEnv): boolean {
  return Boolean((env.GUPSHUP_API_KEY ?? "").trim() && (env.GUPSHUP_SOURCE ?? "").trim());
}

/**
 * Send an approved WhatsApp template via Gupshup. `destination` and `source` must already be
 * digits-only (E.164 without "+"). Returns {ok:false, error} on any failure — the caller decides
 * how to record it; it must NOT let a WhatsApp failure break the surrounding business operation.
 */
export async function sendGupshupTemplate(
  env: ApiEnv,
  input: { destination: string; templateId: string; params: string[] },
): Promise<GupshupSendResult> {
  const apiKey = (env.GUPSHUP_API_KEY ?? "").trim();
  const source = (env.GUPSHUP_SOURCE ?? "").replace(/\D/g, "");
  const srcName = (env.GUPSHUP_SRC_NAME ?? "Backrest").trim();
  const baseUrl = (env.GUPSHUP_API_BASE_URL ?? "https://api.gupshup.io").replace(/\/+$/, "");

  if (!apiKey || !source) return { ok: false, error: "Gupshup not configured" };
  if (!input.templateId) return { ok: false, error: "Template id not configured" };
  if (!input.destination) return { ok: false, error: "Missing destination" };

  const body = new URLSearchParams();
  body.set("channel", "whatsapp");
  body.set("source", source);
  body.set("destination", input.destination);
  body.set("src.name", srcName);
  body.set("template", JSON.stringify({ id: input.templateId, params: input.params }));

  try {
    const res = await fetch(`${baseUrl}/wa/api/v1/template/msg`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cache-Control": "no-cache",
        apikey: apiKey,
      },
      body: body.toString(),
    });

    const text = await res.text();
    if (!res.ok) {
      // Keep the reason short + safe (status + trimmed body); never includes our apikey.
      return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 300)}` };
    }
    // Gupshup returns JSON like {"status":"submitted","messageId":"..."}.
    let providerMessageId: string | null = null;
    try {
      const json = JSON.parse(text) as { messageId?: string; status?: string };
      providerMessageId = json.messageId ?? null;
      if (json.status && json.status !== "submitted" && json.status !== "success") {
        return { ok: false, error: `Gupshup status: ${json.status}` };
      }
    } catch {
      // Non-JSON 2xx — treat as success but with no message id.
    }
    return { ok: true, providerMessageId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Request failed: ${message.slice(0, 300)}` };
  }
}
