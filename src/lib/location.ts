// Client mirror of the server's location composer (api/services/pincodes.ts displayLocation).
// Single place to turn structured location parts into a display string, so no module rebuilds it.

export type StructuredLocation = {
  area?: string | null;
  district?: string | null;
  state?: string | null;
  pincode?: string | null;
};

/** "Area, District, State 440012" from structured parts. Returns "" when there are no parts. */
export function displayLocation(loc: StructuredLocation): string {
  const place = [loc.area, loc.district, loc.state]
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(", ");
  const pin = (loc.pincode ?? "").trim();
  return [place, pin].filter(Boolean).join(" ").trim();
}

/**
 * Best location string for display: prefer the structured parts, fall back to the legacy free-text
 * `location` (older dealers / admin-created dealers without a pincode), then a final fallback.
 */
export function resolveLocationDisplay(
  loc: StructuredLocation & { location?: string | null },
  fallback = "",
): string {
  return displayLocation(loc) || (loc.location ?? "").trim() || fallback;
}
