import { useMemo } from "react";
import type { ReportFilterOptions, ReportFilters } from "@/services/admin/executive-reports";
import { monthLabel } from "./executive-types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/multi-select";

type Props = {
  filters: ReportFilters;
  options: ReportFilterOptions;
  onChange: (next: ReportFilters) => void;
  onReset?: () => void;
  canReset?: boolean;
};

/** CSV <-> array helpers. Report filter fields are comma-separated strings on the wire/URL. */
function toArr(csv?: string): string[] {
  return csv ? csv.split(",").map((v) => v.trim()).filter(Boolean) : [];
}
function toCsv(arr: string[]): string | undefined {
  return arr.length ? arr.join(",") : undefined;
}

/** Single-select (used for the date range controls, which aren't multi-select). */
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
  const years = [...new Set(options.months.map((m) => m.slice(0, 4)))];
  const selectedYear =
    filters.from && filters.to && filters.from.slice(0, 4) === filters.to.slice(0, 4)
      ? filters.from.slice(0, 4)
      : "all";

  // Current multi-select selections (as arrays).
  const selTerritories = toArr(filters.territory);
  const selDistributors = toArr(filters.distributorId);
  const selExecutives = toArr(filters.salesExecutiveId);
  const selDealers = toArr(filters.dealerId);
  const selProducts = toArr(filters.product);
  const selCategories = toArr(filters.category);
  const selStatuses = toArr(filters.status);
  const selCampaigns = toArr(filters.campaignId);
  const selDealerTiers = toArr(filters.dealerTier);
  const selDistributorTiers = toArr(filters.distributorTier);

  // ---- Cascading option lists (territory → distributor → sales exec → dealer) --------------
  // Distributors available given the selected territories: those that have at least one dealer
  // in a selected territory. (No territory selected → all distributors.)
  const territorySet = useMemo(() => new Set(selTerritories), [selTerritories]);
  const distributorOptions = useMemo<MultiSelectOption[]>(() => {
    if (territorySet.size === 0) {
      return options.distributors.map((d) => ({ value: d.id, label: d.name }));
    }
    const allowed = new Set(
      options.dealers.filter((d) => d.territory && territorySet.has(d.territory)).map((d) => d.distributorId),
    );
    return options.distributors
      .filter((d) => allowed.has(d.id))
      .map((d) => ({ value: d.id, label: d.name }));
  }, [options.distributors, options.dealers, territorySet]);

  // Sales execs available given selected territories + distributors.
  const distributorSet = useMemo(() => new Set(selDistributors), [selDistributors]);
  const executiveOptions = useMemo<MultiSelectOption[]>(() => {
    let execs = options.executives;
    if (distributorSet.size > 0) {
      execs = execs.filter((e) => e.distributorId && distributorSet.has(e.distributorId));
    }
    if (territorySet.size > 0) {
      // Keep execs that have at least one dealer in a selected territory.
      const execWithTerritory = new Set(
        options.dealers
          .filter((d) => d.territory && territorySet.has(d.territory) && d.salesExecutiveId)
          .map((d) => d.salesExecutiveId),
      );
      execs = execs.filter((e) => execWithTerritory.has(e.id));
    }
    return execs.map((e) => ({ value: e.id, label: e.name }));
  }, [options.executives, options.dealers, distributorSet, territorySet]);

  // Dealers available given selected territories + distributors + sales execs.
  const executiveSet = useMemo(() => new Set(selExecutives), [selExecutives]);
  const dealerOptions = useMemo<MultiSelectOption[]>(() => {
    let dealers = options.dealers;
    if (territorySet.size > 0) dealers = dealers.filter((d) => d.territory && territorySet.has(d.territory));
    if (distributorSet.size > 0) dealers = dealers.filter((d) => d.distributorId && distributorSet.has(d.distributorId));
    if (executiveSet.size > 0) dealers = dealers.filter((d) => d.salesExecutiveId && executiveSet.has(d.salesExecutiveId));
    return dealers.map((d) => ({ value: d.id, label: d.name }));
  }, [options.dealers, territorySet, distributorSet, executiveSet]);

  // ---- Change handlers that reset now-invalid child selections -----------------------------
  const prune = (selected: string[], allowed: MultiSelectOption[]): string[] => {
    const allowedSet = new Set(allowed.map((o) => o.value));
    return selected.filter((v) => allowedSet.has(v));
  };

  const changeTerritory = (next: string[]) => {
    const nextTerritorySet = new Set(next);
    // Recompute allowed children under the new territory selection and prune invalid ones.
    const allowedDist = next.length
      ? options.distributors.filter((d) =>
          options.dealers.some((dl) => dl.distributorId === d.id && dl.territory && nextTerritorySet.has(dl.territory)),
        )
      : options.distributors;
    const allowedDistSet = new Set(allowedDist.map((d) => d.id));
    const prunedDist = selDistributors.filter((v) => allowedDistSet.has(v));

    const allowedExec = options.executives.filter((e) => {
      const byDist = prunedDist.length ? e.distributorId && prunedDist.includes(e.distributorId) : true;
      const byTerr = next.length
        ? options.dealers.some((dl) => dl.salesExecutiveId === e.id && dl.territory && nextTerritorySet.has(dl.territory))
        : true;
      return byDist && byTerr;
    });
    const prunedExec = prune(selExecutives, allowedExec.map((e) => ({ value: e.id, label: e.name })));

    const allowedDealers = options.dealers.filter((d) => {
      if (next.length && !(d.territory && nextTerritorySet.has(d.territory))) return false;
      if (prunedDist.length && !(d.distributorId && prunedDist.includes(d.distributorId))) return false;
      if (prunedExec.length && !(d.salesExecutiveId && prunedExec.includes(d.salesExecutiveId))) return false;
      return true;
    });
    const prunedDealers = prune(selDealers, allowedDealers.map((d) => ({ value: d.id, label: d.name })));

    onChange({
      ...filters,
      territory: toCsv(next),
      distributorId: toCsv(prunedDist),
      salesExecutiveId: toCsv(prunedExec),
      dealerId: toCsv(prunedDealers),
    });
  };

  const changeDistributor = (next: string[]) => {
    const nextDistSet = new Set(next);
    // Prune execs + dealers that no longer belong to any selected distributor.
    const allowedExec = options.executives.filter((e) =>
      next.length ? e.distributorId && nextDistSet.has(e.distributorId) : true,
    );
    const prunedExec = prune(selExecutives, allowedExec.map((e) => ({ value: e.id, label: e.name })));

    const allowedDealers = options.dealers.filter((d) => {
      if (next.length && !(d.distributorId && nextDistSet.has(d.distributorId))) return false;
      if (territorySet.size > 0 && !(d.territory && territorySet.has(d.territory))) return false;
      if (prunedExec.length && !(d.salesExecutiveId && prunedExec.includes(d.salesExecutiveId))) return false;
      return true;
    });
    const prunedDealers = prune(selDealers, allowedDealers.map((d) => ({ value: d.id, label: d.name })));

    onChange({
      ...filters,
      distributorId: toCsv(next),
      salesExecutiveId: toCsv(prunedExec),
      dealerId: toCsv(prunedDealers),
    });
  };

  const changeExecutive = (next: string[]) => {
    const nextExecSet = new Set(next);
    const allowedDealers = options.dealers.filter((d) => {
      if (next.length && !(d.salesExecutiveId && nextExecSet.has(d.salesExecutiveId))) return false;
      if (territorySet.size > 0 && !(d.territory && territorySet.has(d.territory))) return false;
      if (distributorSet.size > 0 && !(d.distributorId && distributorSet.has(d.distributorId))) return false;
      return true;
    });
    const prunedDealers = prune(selDealers, allowedDealers.map((d) => ({ value: d.id, label: d.name })));
    onChange({ ...filters, salesExecutiveId: toCsv(next), dealerId: toCsv(prunedDealers) });
  };

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
          onValueChange={(from) => onChange({ ...filters, from, to: filters.to && filters.to < from ? from : filters.to })}
          options={options.months.map((m) => ({ value: m, label: monthLabel(m) }))}
        />
        <FilterSelect
          label="To"
          value={filters.to ?? options.months[options.months.length - 1] ?? ""}
          onValueChange={(to) => onChange({ ...filters, to, from: filters.from && filters.from > to ? to : filters.from })}
          options={options.months.map((m) => ({ value: m, label: monthLabel(m) }))}
        />
        <FilterSelect
          label="Year"
          value={selectedYear}
          onValueChange={(year) => {
            if (year === "all") return;
            const inYear = options.months.filter((m) => m.startsWith(year));
            onChange({ ...filters, from: inYear[0], to: inYear[inYear.length - 1] });
          }}
          options={[{ value: "all", label: "Custom range" }, ...years.map((y) => ({ value: y, label: y }))]}
        />
        <FilterSelect
          label="Month"
          value={filters.from && filters.from === filters.to ? filters.from : "all"}
          onValueChange={(v) => {
            if (v === "all") {
              // Widen back out of a single-month drill: if a specific Year is selected, span that
              // whole year; otherwise span the full available month range. (Previously this did
              // nothing, so "All months" was un-selectable once a month was picked.)
              const scope =
                selectedYear !== "all"
                  ? options.months.filter((m) => m.startsWith(selectedYear))
                  : options.months;
              if (scope.length === 0) return;
              onChange({ ...filters, from: scope[0], to: scope[scope.length - 1] });
              return;
            }
            onChange({ ...filters, from: v, to: v });
          }}
          options={[{ value: "all", label: "All months in range" }, ...options.months.map((m) => ({ value: m, label: monthLabel(m) }))]}
        />
        <MultiSelect
          label="Territory / State"
          selected={selTerritories}
          onChange={changeTerritory}
          placeholderAll="All territories"
          options={(options.territories ?? []).map((t) => ({ value: t, label: t }))}
        />
        <MultiSelect
          label="Distributor"
          selected={selDistributors}
          onChange={changeDistributor}
          placeholderAll="All distributors"
          options={distributorOptions}
        />
        <MultiSelect
          label="Sales executive"
          selected={selExecutives}
          onChange={changeExecutive}
          placeholderAll="All executives"
          options={executiveOptions}
        />
        <MultiSelect
          label="Dealer"
          selected={selDealers}
          onChange={(next) => onChange({ ...filters, dealerId: toCsv(next) })}
          placeholderAll="All dealers"
          options={dealerOptions}
        />
        <MultiSelect
          label="Product"
          selected={selProducts}
          onChange={(next) => onChange({ ...filters, product: toCsv(next) })}
          placeholderAll="All products"
          options={options.products.map((p) => ({ value: p, label: p }))}
        />
        <MultiSelect
          label="Category"
          selected={selCategories}
          onChange={(next) => onChange({ ...filters, category: toCsv(next) })}
          placeholderAll="All categories"
          options={options.categories.map((c) => ({ value: c, label: c }))}
        />
        <MultiSelect
          label="Campaign"
          selected={selCampaigns}
          onChange={(next) => onChange({ ...filters, campaignId: toCsv(next) })}
          placeholderAll="All campaigns"
          options={(options.campaigns ?? []).map((c) => ({ value: c.id, label: c.name }))}
        />
        <MultiSelect
          label="Order status"
          selected={selStatuses}
          onChange={(next) => onChange({ ...filters, status: toCsv(next) })}
          placeholderAll="Confirmed (excl. cancelled)"
          options={options.statuses.map((s) => ({ value: s, label: s.replaceAll("_", " ") }))}
        />
        <MultiSelect
          label="Dealer tier"
          selected={selDealerTiers}
          onChange={(next) => onChange({ ...filters, dealerTier: toCsv(next) })}
          placeholderAll="All dealer tiers"
          options={(options.tiers ?? []).map((tt) => ({ value: tt.id, label: tt.name }))}
        />
        <MultiSelect
          label="Distributor tier"
          selected={selDistributorTiers}
          onChange={(next) => onChange({ ...filters, distributorTier: toCsv(next) })}
          placeholderAll="All distributor tiers"
          options={(options.tiers ?? []).map((tt) => ({ value: tt.id, label: tt.name }))}
        />
      </div>
    </div>
  );
}
