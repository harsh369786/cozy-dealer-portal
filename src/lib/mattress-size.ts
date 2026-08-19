import { BREADTHS, LENGTHS } from "@/lib/demo-data";

export function nearestStandard(value: number, standards: number[]): number {
  if (!Number.isFinite(value) || standards.length === 0) return value;
  return standards.reduce((best, cur) =>
    Math.abs(cur - value) < Math.abs(best - value) ? cur : best,
  );
}

export function mapToNearestStandardSize(length: number, breadth: number) {
  return {
    requestedLength: length,
    requestedBreadth: breadth,
    standardLength: nearestStandard(length, LENGTHS),
    standardBreadth: nearestStandard(breadth, BREADTHS),
  };
}

export function formatSizeLabel(length: number, breadth: number, thickness?: string) {
  const base = `${length}" × ${breadth}"`;
  return thickness ? `${base} × ${thickness}` : base;
}
