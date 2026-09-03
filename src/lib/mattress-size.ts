/** Standard mattress dimensions used for manufacturing reference (not input limits). */

// Small sizes are allowed: anything smaller in area than the base 72"×36" is priced at the
// base rate on the server. Only a positive value and the upper cap are enforced.
export const MIN_MATTRESS_LENGTH_IN = 1;
export const MIN_MATTRESS_BREADTH_IN = 1;
export const MAX_MATTRESS_LENGTH_IN = 84;
export const MAX_MATTRESS_BREADTH_IN = 84;

export const LENGTHS = [72, 75, 78, 84];

export const BREADTHS = [30, 36, 42, 48, 60, 66, 72, 75, 78, 84];



const DIMENSION_STEP = 0.25;



export function parseDimensionInput(raw: string): number {

  const cleaned = raw.replace(/[^\d.]/g, "");

  if (!cleaned || cleaned === ".") return 0;

  const n = Number(cleaned);

  return Number.isFinite(n) ? n : 0;

}

export function getMattressDimensionError(length: number, breadth: number): string | null {
  if (length <= 0 || breadth <= 0) return "Enter valid length and width";
  // No lower-bound rejection: smaller-than-standard sizes are allowed and priced at the base
  // 72"×36" rate. Only the upper cap is enforced.
  if (length > MAX_MATTRESS_LENGTH_IN) {
    return `Length must be at most ${MAX_MATTRESS_LENGTH_IN}"`;
  }
  if (breadth > MAX_MATTRESS_BREADTH_IN) {
    return `Width must be at most ${MAX_MATTRESS_BREADTH_IN}"`;
  }
  return null;
}



export function snapDimensionToQuarter(value: number): number {

  if (!Number.isFinite(value) || value <= 0) return 0;

  return Math.round(value / DIMENSION_STEP) * DIMENSION_STEP;

}



export function snapDimensionInput(raw: string): string {

  const parsed = parseDimensionInput(raw);

  if (parsed <= 0) return raw.replace(/[^\d.]/g, "");

  const snapped = snapDimensionToQuarter(parsed);

  return Number.isInteger(snapped) ? String(snapped) : snapped.toFixed(2).replace(/\.?0+$/, "");

}



export function ceilToStandard(value: number, standards: number[]): number {
  if (!Number.isFinite(value) || value <= 0) return value;
  const normalized = snapDimensionToQuarter(value);
  const sorted = [...standards].sort((a, b) => a - b);
  if (sorted.includes(normalized)) return normalized;
  for (const size of sorted) {
    if (size >= normalized) return size;
  }
  return sorted[sorted.length - 1]!;
}

/**
 * Standard-size buffer (inches) mirrored from the server default. A dimension within this
 * buffer ABOVE a standard is priced at that lower standard. Kept in sync with the server's
 * DEFAULT_STANDARD_SIZE_BUFFER_IN so the displayed "standard size" matches what the server
 * charges. (The server can override via env; the client uses the 1" default for display.)
 */
export const STANDARD_SIZE_BUFFER_IN = 1;

/** Like ceilToStandard but subtracts the buffer first, so e.g. 73" -> 72" (not 75"). */
export function ceilToStandardWithBuffer(
  value: number,
  standards: number[],
  buffer: number = STANDARD_SIZE_BUFFER_IN,
): number {
  if (!Number.isFinite(value) || value <= 0) return value;
  const adjusted = buffer > 0 ? value - buffer : value;
  return ceilToStandard(adjusted, standards);
}

/** Round input up to the next highest standard size (after quarter-inch snap). */
export function snapToCeilStandardInput(raw: string, standards: number[]): string {
  const parsed = parseDimensionInput(raw);
  if (parsed <= 0) return raw.replace(/[^\d.]/g, "");
  return String(ceilToStandard(parsed, standards));
}

export function mapToCeilStandardSize(length: number, breadth: number) {
  return {
    requestedLength: length,
    requestedBreadth: breadth,
    // Apply the 1" buffer per dimension so the displayed standard matches what the server
    // prices (e.g. 73" shows/prices as 72", not 75").
    standardLength: ceilToStandardWithBuffer(length, LENGTHS),
    standardBreadth: ceilToStandardWithBuffer(breadth, BREADTHS),
  };
}

/** @deprecated Use mapToCeilStandardSize */
export const mapToNearestStandardSize = mapToCeilStandardSize;



export function formatSizeLabel(length: number, breadth: number, thickness?: string) {

  const base = `${length}" × ${breadth}"`;

  return thickness ? `${base} × ${thickness}` : base;

}



export function formatRequestedVsStandard(

  length: number,

  breadth: number,

  mapped: ReturnType<typeof mapToCeilStandardSize>,

) {

  const requested = formatSizeLabel(length, breadth);

  const standard = formatSizeLabel(mapped.standardLength, mapped.standardBreadth);

  if (requested === standard) return { requested, standard: null as string | null };

  return { requested, standard };

}


