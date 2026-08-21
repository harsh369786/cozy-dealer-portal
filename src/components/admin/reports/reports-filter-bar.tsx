import type { AdminAnalyticsReport, AnalyticsFilters } from "@/lib/admin/analytics";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  report: AdminAnalyticsReport;
  onChange: (filters: AnalyticsFilters) => void;
};

export function ReportsFilterBar({ report, onChange }: Props) {
  const { filters, filterOptions } = report;

  const update = (patch: Partial<AnalyticsFilters>) => {
    onChange({ month: filters.month, distributorId: filters.distributorId, ...patch });
  };

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-3xl border border-border bg-card p-4 shadow-soft">
      <FilterSelect
        label="Month"
        value={filters.month ?? "Aug"}
        onValueChange={(month) => update({ month })}
        options={filterOptions.months.map((m) => ({ value: m, label: m }))}
      />
      {report.scopeLevel === "overall" && (
        <FilterSelect
          label="Distributor"
          value={filters.distributorId ?? "all"}
          onValueChange={(v) => update({ distributorId: v === "all" ? undefined : v })}
          options={[
            { value: "all", label: "All distributors" },
            ...filterOptions.distributors.map((d) => ({ value: d.id, label: d.name })),
          ]}
        />
      )}
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
    <div className="min-w-[160px] flex-1 sm:max-w-xs">
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
