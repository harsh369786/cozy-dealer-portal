/** Turn stored free-item JSON or plain text into a dealer-facing label. */
export function formatFreeItemsDisplay(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
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
            const qty = Math.max(1, Number(row.quantity) || 1);
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
