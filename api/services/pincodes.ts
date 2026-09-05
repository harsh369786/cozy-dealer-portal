// India Post pincode master lookup (table `pincodes`, migration 0037; data loaded from
// pincode master.csv via scripts/generate-pincodes-sql.mjs). Single source of truth for
// resolving a 6-digit pincode to its State / District / Area(s). Reused by the public signup
// lookup endpoint and by server-side validation on signup — no duplicated pincode logic elsewhere.

export type PincodeLookup = {
  pincode: string;
  state: string;
  district: string;
  /** All post-office areas for this pincode (a pincode can span several). */
  areas: string[];
};

/** A syntactically valid Indian pincode is exactly 6 digits. */
export function isValidPincodeFormat(code: string | undefined | null): boolean {
  return /^\d{6}$/.test(String(code ?? "").trim());
}

/**
 * Compose a human-readable location string from structured parts, e.g. "Sitabuldi, Nagpur,
 * Maharashtra 440012". Used to keep the legacy free-text `dealers.location` populated for back-compat
 * display and search while the structured columns are the source of truth. Returns "" when no parts.
 */
export function displayLocation(loc: {
  area?: string | null;
  district?: string | null;
  state?: string | null;
  pincode?: string | null;
}): string {
  const place = [loc.area, loc.district, loc.state]
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(", ");
  const pin = (loc.pincode ?? "").trim();
  return [place, pin].filter(Boolean).join(" ").trim();
}

/**
 * Resolve a pincode to its state/district and the list of areas. Returns null when the code is
 * malformed or not found in the master. State/district come from the first row (they are constant
 * for a given pincode in the India Post data).
 */
export async function lookupPincode(
  db: D1Database,
  code: string,
): Promise<PincodeLookup | null> {
  const pincode = String(code ?? "").trim();
  if (!isValidPincodeFormat(pincode)) return null;

  const { results } = await db
    .prepare(
      `SELECT state, district, area FROM pincodes WHERE pincode = ? ORDER BY area`,
    )
    .bind(pincode)
    .all<{ state: string; district: string; area: string }>();

  if (!results.length) return null;

  return {
    pincode,
    state: results[0]!.state,
    district: results[0]!.district,
    areas: results.map((r) => r.area),
  };
}

/**
 * Server-side validation for a submitted (pincode, area) pair. Confirms the pincode exists and,
 * when an area is supplied, that it belongs to that pincode. Returns the normalized
 * {pincode, state, district, area} to persist, or throws a clear error. Used by signup so a
 * client can't post arbitrary/forged location text.
 */
export async function resolveSubmittedLocation(
  db: D1Database,
  input: { pincode?: string | null; area?: string | null },
): Promise<{ pincode: string; state: string; district: string; area: string }> {
  const lookup = await lookupPincode(db, input.pincode ?? "");
  if (!lookup) {
    throw new Error("Enter a valid 6-digit pincode");
  }
  const area = String(input.area ?? "").trim();
  // If the pincode has a single area, accept it without requiring the client to echo it back.
  const resolvedArea =
    lookup.areas.length === 1
      ? lookup.areas[0]!
      : lookup.areas.find((a) => a === area);
  if (!resolvedArea) {
    throw new Error("Select a valid area for this pincode");
  }
  return {
    pincode: lookup.pincode,
    state: lookup.state,
    district: lookup.district,
    area: resolvedArea,
  };
}
