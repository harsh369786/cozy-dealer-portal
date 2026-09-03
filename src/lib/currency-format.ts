import { formatInr } from "@/lib/date-format";
import i18n from "@/lib/i18n";

/** ₹ amount formatted for the active locale (en/hi). */
export const inr = (n: number) => formatInr(n, i18n.language === "hi" ? "hi" : "en");

/** Compact ₹ amount: Cr / L / K, falling back to full ₹ for small values. */
export const inrCompact = (n: number) => {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)} Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)} L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)} K`;
  return inr(n);
};

/** Compact number (no currency symbol): Cr / L / K. */
export const compactNumber = (n: number) => {
  if (n >= 10000000) return `${(n / 10000000).toFixed(1)} Cr`;
  if (n >= 100000) return `${(n / 100000).toFixed(1)} L`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)} K`;
  return n.toLocaleString("en-IN");
};
