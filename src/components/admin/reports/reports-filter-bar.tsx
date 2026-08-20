import type { AdminAnalyticsReport, AnalyticsFilters } from "@/lib/admin/analytics";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

type Props = {
  report: AdminAnalyticsReport;
  onChange: (filters: AnalyticsFilters) => void;
};

export function ReportsFilterBar({ report, onChange }: Props) {
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

  const clearAll = () => onChange({ month: filters.month });

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-3xl border border-border bg-card p-4 shadow-soft">
      <FilterSelect
        label="Month"
        value={filters.month ?? "Aug"}
        onValueChange={(month) => update({ month })}
        options={filterOptions.months.map((m) => ({ value: m, label: m }))}
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
      <FilterSelect
        label="Product"
        value={filters.product ?? "all"}
        onValueChange={(v) => update({ product: v === "all" ? undefined : v })}
        options={[
          { value: "all", label: "All products" },
          ...filterOptions.products.map((p) => ({ value: p, label: p })),
        ]}
      />
      <FilterSelect
        label="Category"
        value={filters.category ?? "all"}
        onValueChange={(v) => update({ category: v === "all" ? undefined : v })}
        options={[
          { value: "all", label: "All categories" },
          ...filterOptions.categories.map((c) => ({ value: c, label: c })),
        ]}
      />
      <Button type="button" variant="ghost" className="rounded-2xl font-semibold" onClick={clearAll}>
        Reset filters
      </Button>
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
    <div className="min-w-[140px] flex-1">
      <p className="mb-1 text-xs font-semibold text-muted-foreground">{label}</p>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="rounded-2xl">
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
