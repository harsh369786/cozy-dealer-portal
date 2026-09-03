/** Base mattress size that catalog prices are quoted for (72" × 36"). */
export const BASE_MATTRESS_LENGTH = 72;
export const BASE_MATTRESS_BREADTH = 36;

// Any positive size is allowed on the small end: sizes smaller in area than the base
// 72"×36" are simply charged at the base price (the size factor is clamped to >= 1.0 in
// sizeAreaFactor). We keep a tiny positive floor only to reject zero/garbage input.
export const MIN_MATTRESS_LENGTH_IN = 1;
export const MIN_MATTRESS_BREADTH_IN = 1;
export const MAX_MATTRESS_LENGTH_IN = 84;
export const MAX_MATTRESS_BREADTH_IN = 84;

export const STANDARD_LENGTHS = [72, 75, 78, 84];
export const STANDARD_BREADTHS = [30, 36, 42, 48, 60, 66, 72, 75, 78, 84];

/**
 * Buffer (in inches) applied per dimension when snapping a custom size to a standard size for
 * pricing. If an entered dimension is within this buffer ABOVE a standard size, it is priced
 * at that lower standard instead of ceiling up to the next one. Example with buffer=1:
 * 73" -> priced as 72" (not 75"). Configurable so it can change from 1" later; an env var
 * (STANDARD_SIZE_BUFFER_IN) can override it at runtime without a code change.
 */
export const DEFAULT_STANDARD_SIZE_BUFFER_IN = 1;

// The currently active buffer. Defaults to 1" and can be overridden at runtime from env via
// configureStandardSizeBuffer() (called from request middleware). Using a module-level value
// avoids threading a buffer argument through every pricing signature and its callers, and
// mirrors the existing per-request env-capture pattern used for push.
let activeStandardSizeBuffer = DEFAULT_STANDARD_SIZE_BUFFER_IN;

/** Parse a buffer value (env string/number) into a valid non-negative inches value. */
export function resolveStandardSizeBuffer(
  env?: { STANDARD_SIZE_BUFFER_IN?: string | number | null },
): number {
  const raw = env?.STANDARD_SIZE_BUFFER_IN;
  if (raw == null || raw === "") return DEFAULT_STANDARD_SIZE_BUFFER_IN;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_STANDARD_SIZE_BUFFER_IN;
}

/** Set the active buffer from env (call once per request in middleware). */
export function configureStandardSizeBuffer(env?: { STANDARD_SIZE_BUFFER_IN?: string | number | null }): void {
  activeStandardSizeBuffer = resolveStandardSizeBuffer(env);
}

/** The buffer currently in effect (env override or the 1" default). */
export function getStandardSizeBuffer(): number {
  return activeStandardSizeBuffer;
}

const THICKNESS_MULTIPLIERS: Record<string, number> = {
  '2"': 0.45,
  '3"': 0.55,
  '4"': 0.7,
  '5"': 1,
  '6"': 1.12,
  '8"': 1.28,
  '10"': 1.45,
};

export function parseThicknessInches(thickness?: string | null): number | null {
  if (!thickness) return null;
  const match = thickness.match(/([\d.]+)/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

export function thicknessFactor(thickness?: string | null): number {
  if (!thickness) return 1;
  const key = thickness.trim();
  if (THICKNESS_MULTIPLIERS[key] != null) return THICKNESS_MULTIPLIERS[key]!;
  const inches = parseThicknessInches(key);
  if (inches == null) return 1;
  return Math.round((inches / 5) * 100) / 100;
}

export function ceilToStandard(value: number, standards: number[]): number {
  if (!Number.isFinite(value) || value <= 0) return value;
  const normalized = Math.round(value * 4) / 4;
  const sorted = [...standards].sort((a, b) => a - b);
  if (sorted.includes(normalized)) return normalized;
  for (const size of sorted) {
    if (size >= normalized) return size;
  }
  return sorted[sorted.length - 1]!;
}

/**
 * Like ceilToStandard, but first subtracts a per-dimension buffer so a size within `buffer`
 * inches ABOVE a standard snaps down to that standard instead of ceiling to the next one.
 * e.g. buffer=1: 73" -> 72", 74" -> 75" (beyond the buffer), 72" -> 72".
 */
export function ceilToStandardWithBuffer(
  value: number,
  standards: number[],
  buffer: number = DEFAULT_STANDARD_SIZE_BUFFER_IN,
): number {
  if (!Number.isFinite(value) || value <= 0) return value;
  const adjusted = buffer > 0 ? value - buffer : value;
  // If subtracting the buffer drops below the smallest standard, ceilToStandard still returns
  // the smallest standard, which is the intended behavior for small sizes.
  return ceilToStandard(adjusted, standards);
}

export function assertMattressDimensions(lengthIn?: number | null, breadthIn?: number | null): void {
  if (lengthIn == null && breadthIn == null) return;
  if (!lengthIn || !breadthIn || lengthIn <= 0 || breadthIn <= 0) {
    throw new Error("Enter valid length and width");
  }
  // No lower-bound rejection beyond "must be positive": smaller-than-base sizes are allowed
  // and simply priced at the base 72"×36" rate (see sizeAreaFactor clamp).
  if (lengthIn > MAX_MATTRESS_LENGTH_IN) {
    throw new Error(`Length must be at most ${MAX_MATTRESS_LENGTH_IN} inches`);
  }
  if (breadthIn > MAX_MATTRESS_BREADTH_IN) {
    throw new Error(`Width must be at most ${MAX_MATTRESS_BREADTH_IN} inches`);
  }
}

export function pricingDimensions(
  lengthIn?: number | null,
  breadthIn?: number | null,
  buffer: number = getStandardSizeBuffer(),
) {
  if (!lengthIn || !breadthIn || lengthIn <= 0 || breadthIn <= 0) {
    return { lengthIn, breadthIn };
  }
  // Apply the buffer independently to each dimension before snapping to a standard size.
  return {
    lengthIn: ceilToStandardWithBuffer(lengthIn, STANDARD_LENGTHS, buffer),
    breadthIn: ceilToStandardWithBuffer(breadthIn, STANDARD_BREADTHS, buffer),
  };
}

export function sizeAreaFactor(lengthIn?: number | null, breadthIn?: number | null): number {
  if (!lengthIn || !breadthIn || lengthIn <= 0 || breadthIn <= 0) return 1;
  const base = BASE_MATTRESS_LENGTH * BASE_MATTRESS_BREADTH;
  const factor = (lengthIn * breadthIn) / base;
  // The base 72"×36" price is the floor: a mattress smaller in area than the base is charged
  // at the base price, never cheaper. Larger sizes scale up normally. This clamp drives both
  // the displayed price and the charged price, since both derive from this factor.
  return factor < 1 ? 1 : factor;
}

export function applyMattressPricing(
  baseMrp: number,
  baseDealer: number,
  opts: {
    lengthIn?: number | null;
    breadthIn?: number | null;
    thickness?: string | null;
    buffer?: number;
  },
) {
  const sized = pricingDimensions(
    opts.lengthIn,
    opts.breadthIn,
    opts.buffer ?? getStandardSizeBuffer(),
  );
  const factor =
    sizeAreaFactor(sized.lengthIn, sized.breadthIn) * thicknessFactor(opts.thickness);
  return {
    factor,
    mrp: Math.round(baseMrp * factor),
    dealerPrice: Math.round(baseDealer * factor),
    pricingLength: sized.lengthIn,
    pricingBreadth: sized.breadthIn,
  };
}
