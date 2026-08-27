/** Base mattress size that catalog prices are quoted for (72" × 36"). */
export const BASE_MATTRESS_LENGTH = 72;
export const BASE_MATTRESS_BREADTH = 36;

export const MIN_MATTRESS_LENGTH_IN = 72;
export const MIN_MATTRESS_BREADTH_IN = 30;
export const MAX_MATTRESS_LENGTH_IN = 84;
export const MAX_MATTRESS_BREADTH_IN = 84;

export const STANDARD_LENGTHS = [72, 75, 78, 84];
export const STANDARD_BREADTHS = [30, 36, 42, 48, 60, 66, 72, 75, 78, 84];

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

export function assertMattressDimensions(lengthIn?: number | null, breadthIn?: number | null): void {
  if (lengthIn == null && breadthIn == null) return;
  if (!lengthIn || !breadthIn || lengthIn <= 0 || breadthIn <= 0) {
    throw new Error("Enter valid length and width");
  }
  if (lengthIn < MIN_MATTRESS_LENGTH_IN) {
    throw new Error(`Length must be at least ${MIN_MATTRESS_LENGTH_IN} inches`);
  }
  if (lengthIn > MAX_MATTRESS_LENGTH_IN) {
    throw new Error(`Length must be at most ${MAX_MATTRESS_LENGTH_IN} inches`);
  }
  if (breadthIn < MIN_MATTRESS_BREADTH_IN) {
    throw new Error(`Width must be at least ${MIN_MATTRESS_BREADTH_IN} inches`);
  }
  if (breadthIn > MAX_MATTRESS_BREADTH_IN) {
    throw new Error(`Width must be at most ${MAX_MATTRESS_BREADTH_IN} inches`);
  }
}

export function pricingDimensions(lengthIn?: number | null, breadthIn?: number | null) {
  if (!lengthIn || !breadthIn || lengthIn <= 0 || breadthIn <= 0) {
    return { lengthIn, breadthIn };
  }
  return {
    lengthIn: ceilToStandard(lengthIn, STANDARD_LENGTHS),
    breadthIn: ceilToStandard(breadthIn, STANDARD_BREADTHS),
  };
}

export function sizeAreaFactor(lengthIn?: number | null, breadthIn?: number | null): number {
  if (!lengthIn || !breadthIn || lengthIn <= 0 || breadthIn <= 0) return 1;
  const base = BASE_MATTRESS_LENGTH * BASE_MATTRESS_BREADTH;
  return (lengthIn * breadthIn) / base;
}

export function applyMattressPricing(
  baseMrp: number,
  baseDealer: number,
  opts: { lengthIn?: number | null; breadthIn?: number | null; thickness?: string | null },
) {
  const sized = pricingDimensions(opts.lengthIn, opts.breadthIn);
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
