import { inr, inrCompact } from "@/lib/demo-data";
import type { DeltaMetric } from "./types";
import { deltaDirection, pctChange, previousMonth } from "./filters";

export function makeDelta(current: number, previous: number): DeltaMetric {
  const changePct = pctChange(current, previous);
  return {
    value: current,
    previous,
    changePct,
    direction: deltaDirection(changePct),
  };
}

export function formatKpiValue(id: string, value: number): string {
  if (id === "sales" || id === "aov") return inrCompact(value);
  if (id === "aov_full") return inr(value);
  return value.toLocaleString("en-IN");
}

export function formatDeltaSub(delta: DeltaMetric, label = "MoM"): string {
  const sign = delta.changePct > 0 ? "+" : "";
  return `${label}: ${sign}${delta.changePct}%`;
}

export function dealerSalesForMonth(
  dealer: { monthSales: number; prevMonthSales: number; monthlyPerformance?: Array<{ month: string; orderValue: number; orders: number }> },
  month: string,
): { sales: number; orders: number } {
  const perf = dealer.monthlyPerformance?.find((p) => p.month === month);
  if (perf) return { sales: perf.orderValue, orders: perf.orders };
  if (month === "Aug") return { sales: dealer.monthSales, orders: 0 };
  if (month === "Jul") return { sales: dealer.prevMonthSales, orders: 0 };
  return { sales: 0, orders: 0 };
}

export function dealerMomDelta(
  dealer: { monthSales: number; prevMonthSales: number; monthlyPerformance?: Array<{ month: string; orderValue: number }> },
  month: string,
): DeltaMetric {
  const current = dealerSalesForMonth(dealer, month).sales;
  const prev = previousMonth(month);
  const previous = prev ? dealerSalesForMonth(dealer, prev).sales : dealer.prevMonthSales;
  return makeDelta(current, previous);
}

export function yoyDelta(current: number, priorYear?: number): DeltaMetric | undefined {
  if (priorYear === undefined) return undefined;
  return makeDelta(current, priorYear);
}
