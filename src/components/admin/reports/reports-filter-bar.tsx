import type { AdminAnalyticsReport, AnalyticsFilters } from "@/lib/admin/analytics";
import { MonthRangePicker } from "@/components/shared/month-range-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchBar } from "@/components/shared/search-bar";

type Props = {
  report: AdminAnalyticsReport;
  onChange: (filters: AnalyticsFilters) => void;
  search?: string;
  onSearchChange?: (value: string) => void;
};

export function ReportsFilterBar({ report, onChange, search, onSearchChange }: Props) {
  const { filters, filterOptions } = report;

  const update = (patch: Partial<AnalyticsFilters>) => {
    const next = { ...filters, ...patch };
    if (patch.distributorId !== undefined) {
      delete next.salesExecutiveId;
      delete next.dealerId;
    }
    if (patch.salesExecutiveId !== undefined) delete next.dealerId;
    onChange(next);
  };

  return (
    <div className="min-w-0 space-y-3 rounded-xl border border-border bg-card p-4 shadow-soft">
      {onSearchChange && (
        <SearchBar value={search ?? ""} onChange={onSearchChange} placeholder="Search distributor, dealer or product…" />
      )}
      <div className="grid gap-3 sm:flex sm:flex-wrap sm:items-end">
        <MonthRangePicker
          fromMonth={filters.fromMonth ?? filters.month}
          toMonth={filters.toMonth ?? filters.month ?? filters.fromMonth}
          months={filterOptions.months}
          onChange={(fromMonth, toMonth) => update({ fromMonth, toMonth, month: toMonth })}
        />
        <FilterSelect
          label="Distributor"
          value={filters.distributorId ?? "all"}
          onValueChange={(v) => update({ distributorId: v === "all" ? undefined : v })}
          options={[
            { value: "all", label: "All distributors" },
            ...filterOptions.distributors.map((d) => ({ value: d.id, label: d.name })),
          ]}
        />
        <FilterSelect
          label="Sales executive"
          value={filters.salesExecutiveId ?? "all"}
          onValueChange={(v) => update({ salesExecutiveId: v === "all" ? undefined : v })}
          options={[
            { value: "all", label: "All executives" },
            ...filterOptions.salesExecutives.map((s) => ({ value: s.id, label: s.name })),
          ]}
        />
        <FilterSelect
          label="Dealer"
          value={filters.dealerId ?? "all"}
          onValueChange={(v) => update({ dealerId: v === "all" ? undefined : v })}
          options={[
            { value: "all", label: "All dealers" },
            ...filterOptions.dealers.map((d) => ({ value: d.id, label: d.name })),
          ]}
        />
      </div>
    </div>
  );
}

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
    <div className="min-w-0 flex-1 sm:max-w-[200px]">
      <p className="mb-1 text-xs font-semibold text-muted-foreground">{label}</p>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="rounded-lg">
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
