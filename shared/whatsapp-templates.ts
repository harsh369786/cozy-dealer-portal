// Central WhatsApp template registry for the Gupshup integration. This is the SINGLE place that
// knows the five approved templates, which env var holds each template's Gupshup UUID, and the
// EXACT positional param order each template expects. Nothing else in the app should hardcode a
// template name/id or param order.
//
// Gupshup template send (confirmed wire format):
//   POST {GUPSHUP_API_BASE_URL}/wa/api/v1/template/msg  (application/x-www-form-urlencoded)
//   header: apikey: <GUPSHUP_API_KEY>
//   body:   channel=whatsapp & source=<digits> & destination=<digits> & src.name=<app>
//           & template={"id":"<uuid>","params":[...]}
//
// The `templateKey` values below are the internal keys stored in whatsapp_outbox.template_key. They
// double as the stable event identity used for idempotency (reference_id + template_key unique).

export type WhatsappTemplateKey =
  | "otp_for_login"
  | "mattress_order_placed"
  | "mattress_order_rejection"
  | "mattress_delivered"
  | "campaign_live";

/** Minimal env shape this module reads (subset of ApiEnv) — keeps shared code decoupled. */
export type GupshupTemplateEnv = {
  GUPSHUP_TEMPLATE_ID_OTP?: string;
  GUPSHUP_TEMPLATE_ID_ORDER_PLACED?: string;
  GUPSHUP_TEMPLATE_ID_ORDER_REJECTED?: string;
  GUPSHUP_TEMPLATE_ID_ORDER_DELIVERED?: string;
  GUPSHUP_TEMPLATE_ID_CAMPAIGN_LIVE?: string;
};

type TemplateDef = {
  /** Human business event label (stored in whatsapp_outbox.business_event, shown in admin log). */
  businessEvent: string;
  /** Resolve the Gupshup template UUID from env. Returns "" when not configured. */
  resolveTemplateId: (env: GupshupTemplateEnv) => string;
  /**
   * Build the positional params array (as strings) from the stored outbox payload, in the EXACT
   * order the approved Gupshup template expects. Missing values become "" so positions never shift.
   */
  buildParams: (payload: Record<string, unknown>) => string[];
};

function str(v: unknown): string {
  if (v == null) return "";
  return String(v);
}

/**
 * The five approved templates. Param orders match the Gupshup-approved bodies exactly:
 *
 * otp_for_login          [otp, purpose]   (body has {{1}}=code, {{2}}=purpose e.g. "Login")
 * mattress_order_placed  [name, model, orderNo, length, width, thickness, farma, quantity,
 *                         freeScheme, rewardPoints, placedBy]
 * mattress_order_rejection [name, orderNo, model, reason, length, width, thickness, quantity, placedBy]
 * mattress_delivered     [name, orderNo, model, length, width, thickness, quantity, freeScheme, placedBy]
 * campaign_live          []  (static body, no variables)
 */
export const WHATSAPP_TEMPLATES: Record<WhatsappTemplateKey, TemplateDef> = {
  otp_for_login: {
    businessEvent: "LOGIN_OTP",
    resolveTemplateId: (env) => env.GUPSHUP_TEMPLATE_ID_OTP ?? "",
    // New "login" template body has a SINGLE placeholder: {{1}} = the code
    // ("*{{1}}* is your verification code. Expires in 15 minutes." + copy-code button which reuses {{1}}).
    // Send ONLY the code — a stray second param would be an extra unused variable.
    buildParams: (p) => [str(p.otp)],
  },
  mattress_order_placed: {
    businessEvent: "ORDER_PLACED",
    resolveTemplateId: (env) => env.GUPSHUP_TEMPLATE_ID_ORDER_PLACED ?? "",
    buildParams: (p) => [
      str(p.name),
      str(p.model),
      str(p.orderNo),
      str(p.length),
      str(p.width),
      str(p.thickness),
      str(p.farma),
      str(p.quantity),
      str(p.freeScheme),
      str(p.rewardPoints),
      str(p.placedBy),
    ],
  },
  mattress_order_rejection: {
    businessEvent: "ORDER_REJECTED",
    resolveTemplateId: (env) => env.GUPSHUP_TEMPLATE_ID_ORDER_REJECTED ?? "",
    buildParams: (p) => [
      str(p.name),
      str(p.orderNo),
      str(p.model),
      str(p.reason),
      str(p.length),
      str(p.width),
      str(p.thickness),
      str(p.quantity),
      str(p.placedBy),
    ],
  },
  mattress_delivered: {
    businessEvent: "ORDER_DELIVERED",
    resolveTemplateId: (env) => env.GUPSHUP_TEMPLATE_ID_ORDER_DELIVERED ?? "",
    buildParams: (p) => [
      str(p.name),
      str(p.orderNo),
      str(p.model),
      str(p.length),
      str(p.width),
      str(p.thickness),
      str(p.quantity),
      str(p.freeScheme),
      str(p.placedBy),
    ],
  },
  campaign_live: {
    businessEvent: "CAMPAIGN_LIVE",
    resolveTemplateId: (env) => env.GUPSHUP_TEMPLATE_ID_CAMPAIGN_LIVE ?? "",
    buildParams: () => [],
  },
};

export function getTemplateDef(templateKey: string): TemplateDef | null {
  return WHATSAPP_TEMPLATES[templateKey as WhatsappTemplateKey] ?? null;
}

/** Business-event label for an internal template key (for logging), or the key itself if unknown. */
export function businessEventForTemplate(templateKey: string): string {
  return getTemplateDef(templateKey)?.businessEvent ?? templateKey;
}

/**
 * Format a stored phone into the digits-only form Gupshup expects (E.164 without the leading "+").
 * App phones are stored as "+91XXXXXXXXXX"; a bare 10-digit Indian number gets a 91 prefix.
 * Returns null when the number can't be validated (caller then skips the send safely).
 */
export function formatGupshupPhone(phone: string | null | undefined): string | null {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  // Any other length is not a valid Indian WhatsApp destination for this app.
  return null;
}
