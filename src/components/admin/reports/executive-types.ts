import type { ReportFilters } from "@/services/admin/executive-reports";

export type ReportView = "snapshot" | "monthly" | "accounts" | "products";

export type DrillContext = {
  title: string;
  filters: ReportFilters & { month?: string };
};

export function monthLabel(ym: string) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const [y, m] = ym.split("-");
  return `${months[Number(m) - 1] ?? m} ${y}`;
}
