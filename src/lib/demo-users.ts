/** Test logins that keep rich mock/demo content in the dealer app. */
export const DEMO_PHONE_SUFFIXES = {
  dealer: "9876543210",
  distributor: "9823044120",
  admin: "9999999999",
  salesExecutive: "9777766666",
} as const;

export function normalizePhoneDigits(phone: string | undefined | null): string {
  return String(phone ?? "").replace(/\D/g, "").slice(-10);
}

export function isDemoDealer(phone: string | undefined | null): boolean {
  return normalizePhoneDigits(phone) === DEMO_PHONE_SUFFIXES.dealer;
}

export function firstName(fullName: string | undefined | null): string {
  const trimmed = String(fullName ?? "").trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0] ?? trimmed;
}
