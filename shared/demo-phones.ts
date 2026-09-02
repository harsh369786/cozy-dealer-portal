/** Demo login phones — shared between API and frontend. */
export const DEMO_PHONE_SUFFIXES = {
  dealer: "9876543210",
  distributor: "9823044120",
  admin: "9999999999",
  salesExecutive: "9777766666",
} as const;

const DEMO_LOGIN_PHONE_DIGITS = new Set<string>(Object.values(DEMO_PHONE_SUFFIXES));

export function normalizePhoneDigits(phone: string | undefined | null): string {
  return String(phone ?? "")
    .replace(/\D/g, "")
    .slice(-10);
}

export function isDemoLoginPhone(phone: string | undefined | null): boolean {
  return DEMO_LOGIN_PHONE_DIGITS.has(normalizePhoneDigits(phone));
}
