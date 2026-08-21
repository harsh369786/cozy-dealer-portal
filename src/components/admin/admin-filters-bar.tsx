import type { ReactNode } from "react";
import { SearchBar } from "@/components/shared/search-bar";
import { cn } from "@/lib/utils";

export function AdminFiltersBar({
  search,
  onSearchChange,
  searchPlaceholder = "Search…",
  children,
  className,
}: {
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex flex-col gap-3 lg:flex-row lg:items-center", className)}>
      {onSearchChange !== undefined && (
        <div className="min-w-0 flex-1 lg:max-w-sm">
          <SearchBar value={search ?? ""} onChange={onSearchChange} placeholder={searchPlaceholder} />
        </div>
      )}
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function AdminFilterTabs({
  value,
  onChange,
  tabs,
}: {
  value: string;
  onChange: (value: string) => void;
  tabs: Array<{ value: string; label: string; count?: number }>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((tab) => {
        const active = value === tab.value;
        return (
          <button
            key={tab.value}
            type="button"
            onClick={() => onChange(tab.value)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm font-bold transition-colors",
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-foreground hover:bg-secondary",
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="ml-1.5 text-xs opacity-80">({tab.count})</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
