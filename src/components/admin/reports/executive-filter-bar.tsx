import type { ReportFilterOptions, ReportFilters } from "@/services/admin/executive-reports";
import { monthLabel } from "./executive-types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  filters: ReportFilters;
  options: ReportFilterOptions;
  onChange: (next: ReportFilters) => void;
  onReset?: () => void;
  canReset?: boolean;
};

function FilterSelect({
  label,
  value,
  onValueChange,
  options,
}: {
  label: string;
  value: string;
  onValueChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-xs font-semibold text-muted-foreground">{label}</p>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="w-full rounded-lg">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function ExecutiveFilterBar({ filters, options, onChange, onReset, canReset }: Props) {
  const update = (patch: Partial<ReportFilters>) => onChange({ ...filters, ...patch });
  const years = [...new Set(options.months.map((m) => m.slice(0, 4)))];
  const selectedYear =
    filters.from && filters.to && filters.from.slice(0, 4) === filters.to.slice(0, 4)
      ? filters.from.slice(0, 4)
      : "all";

  return (
    <div className="min-w-0 space-y-3 rounded-xl border border-border bg-card p-4 shadow-soft">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold">Filters</p>
        {onReset ? (
          <button
            type="button"
            onClick={onReset}
            disabled={!canReset}
            className="text-xs font-semibold text-primary disabled:cursor-not-allowed disabled:text-muted-foreground"
          >
            Reset all
          </button>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        <FilterSelect
          label="From"
          value={filters.from ?? options.months[0] ?? ""}
          onValueChange={(from) => update({ from, to: filters.to && filters.to < from ? from : filters.to })}
          options={options.months.map((m) => ({ value: m, label: monthLabel(m) }))}
        />
        <FilterSelect
          label="To"
          value={filters.to ?? options.months[options.months.length - 1] ?? ""}
          onValueChange={(to) => update({ to, from: filters.from && filters.from > to ? to : filters.from })}
          options={options.months.map((m) => ({ value: m, label: monthLabel(m) }))}
        />
        <FilterSelect
          label="Year"
          value={selectedYear}
          onValueChange={(year) => {
            if (year === "all") return;
            const inYear = options.months.filter((m) => m.startsWith(year));
            update({ from: inYear[0], to: inYear[inYear.length - 1] });
          }}
          options={[{ value: "all", label: "Custom range" }, ...years.map((y) => ({ value: y, label: y }))]}
        />
        <FilterSelect
          label="Month"
          value={filters.from && filters.from === filters.to ? filters.from : "all"}
          onValueChange={(v) => {
            if (v === "all") return;
            update({ from: v, to: v });
          }}
          options={[{ value: "all", label: "All months in range" }, ...options.months.map((m) => ({ value: m, label: monthLabel(m) }))]}
        />
        <FilterSelect
          label="Territory / State"
          value={filters.territory ?? "all"}
          onValueChange={(v) => update({ territory: v === "all" ? undefined : v })}
          options={[
            { value: "all", label: "All territories" },
            ...(options.territories ?? []).map((t) => ({ value: t, label: t })),
          ]}
        />
        <FilterSelect
          label="Distributor"
          value={filters.distributorId ?? "all"}
          onValueChange={(v) => update({ distributorId: v === "all" ? undefined : v, dealerId: undefined })}
          options={[
            { value: "all", label: "All distributors" },
            ...options.distributors.map((d) => ({ value: d.id, label: d.name })),
          ]}
        />
        <FilterSelect
          label="Dealer"
          value={filters.dealerId ?? "all"}
          onValueChange={(v) => update({ dealerId: v === "all" ? undefined : v })}
          options={[
            { value: "all", label: "All dealers" },
            ...options.dealers.map((d) => ({ value: d.id, label: d.name })),
          ]}
        />
        <FilterSelect
          label="Sales executive"
          value={filters.salesExecutiveId ?? "all"}
          onValueChange={(v) => update({ salesExecutiveId: v === "all" ? undefined : v })}
          options={[
            { value: "all", label: "All executives" },
            ...options.executives.map((e) => ({ value: e.id, label: e.name })),
          ]}
        />
        <FilterSelect
          label="Product"
          value={filters.product ?? "all"}
          onValueChange={(v) => update({ product: v === "all" ? undefined : v })}
          options={[
            { value: "all", label: "All products" },
            ...options.products.map((p) => ({ value: p, label: p })),
          ]}
        />
        <FilterSelect
          label="Category"
          value={filters.category ?? "all"}
          onValueChange={(v) => update({ category: v === "all" ? undefined : v })}
          options={[
            { value: "all", label: "All categories" },
            ...options.categories.map((c) => ({ value: c, label: c })),
          ]}
        />
        <FilterSelect
          label="Order status"
          value={filters.status ?? "all"}
          onValueChange={(v) => update({ status: v === "all" ? undefined : v })}
          options={[
            { value: "all", label: "Confirmed (excl. cancelled)" },
            ...options.statuses.map((s) => ({ value: s, label: s.replaceAll("_", " ") })),
          ]}
        />
      </div>
    </div>
  );
}
