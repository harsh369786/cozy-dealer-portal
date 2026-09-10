// Single source of truth for generating a dealer/store code.
//
// Format (standardized):  FIRST4-PINCODE  e.g. "BHAR-400001"
//   - FIRST4  = the first four MEANINGFUL letters of the store name (letters only; spaces,
//               digits, punctuation and other characters are ignored), uppercased. If the name has
//               fewer than four letters, whatever letters exist are used (padded is NOT done).
//   - PINCODE = the dealer's actual 6-digit PIN code. When no pincode is available at creation
//               (e.g. the admin "create dealer" form doesn't capture one), we fall back to a
//               placeholder of six zeros so a well-formed, unique code is still produced.
//
// Duplicate handling: if the FIRST4-PINCODE base already exists, a sequential numeric suffix is
// appended — "BHAR-400001-1", "BHAR-400001-2", ... — using ONE consistent method (numbers, not
// letters). The base itself (no suffix) is preferred when free.
//
// IMPORTANT: this is only ever called when a dealer is first created. A dealer's code is never
// regenerated when its name or address is later edited, so existing orders/reports/references that
// key off the code stay stable.

/** First four letters (A–Z only) of the store name, uppercased. Non-letters are dropped. */
export function dealerCodePrefix(storeName: string): string {
  const lettersOnly = String(storeName ?? "").replace(/[^A-Za-z]/g, "");
  const prefix = lettersOnly.slice(0, 4).toUpperCase();
  // Guarantee a non-empty prefix even for a name with no Latin letters (e.g. purely non-Latin
  // script or symbols), so the code is always well-formed.
  return prefix || "DLER";
}

/** Normalize a pincode to exactly 6 digits, or the "000000" placeholder when absent/invalid. */
export function dealerCodePincode(pincode: string | null | undefined): string {
  const digits = String(pincode ?? "").replace(/\D/g, "");
  return /^\d{6}$/.test(digits) ? digits : "000000";
}

/**
 * Generate a unique dealer code in the FIRST4-PINCODE[-N] format, checking existing dealer codes to
 * avoid duplicates. Pass the store name and (optionally) the dealer's 6-digit pincode.
 */
export async function generateDealerCode(
  db: D1Database,
  storeName: string,
  pincode?: string | null,
): Promise<string> {
  const base = `${dealerCodePrefix(storeName)}-${dealerCodePincode(pincode)}`;

  // Pull every existing code that shares this base (exact base or base-<suffix>) in one query, so we
  // can pick the next free sequential suffix deterministically without a race per-candidate.
  const { results } = await db
    .prepare(`SELECT code FROM dealers WHERE code = ? OR code LIKE ?`)
    .bind(base, `${base}-%`)
    .all<{ code: string }>();

  const taken = new Set(results.map((r) => r.code));
  if (!taken.has(base)) return base;

  // Base is taken -> find the lowest free numeric suffix (-1, -2, ...).
  for (let n = 1; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
