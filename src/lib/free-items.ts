/**
 * Turn stored free-item JSON or plain text into a dealer-facing label.
 *
 * The stored free-item quantities are PER UNIT (per mattress). Pass `multiplier` = the order/line
 * quantity so the displayed freebies reflect the whole line — e.g. 1 pillow per unit × qty 3 shows
 * "3 × Pillow". Defaults to 1 (per-unit display, e.g. catalog preview at qty 1). Plain-string
 * legacy values can't be multiplied and are shown as-is.
 */
export function formatFreeItemsDisplay(value: unknown, multiplier = 1): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const factor = Math.max(1, Math.floor(Number(multiplier) || 1));
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => {
          if (typeof item === "string") return item.trim();
          if (item && typeof item === "object") {
            const row = item as { label?: string; quantity?: number };
            const label = String(row.label ?? "").trim();
            if (!label) return "";
            const qty = Math.max(1, Number(row.quantity) || 1) * factor;
            // Always show the quantity, incl. "1 × …", so dealers see a consistent format.
            return `${qty} × ${label}`;
          }
          return "";
        })
        .filter(Boolean)
        .join(", ");
    }
  } catch {
    // already a display string
  }
  return raw;
}
