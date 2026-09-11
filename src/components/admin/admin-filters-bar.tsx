import type { ReactNode } from "react";
import { SearchBar } from "@/components/shared/search-bar";
import { cn } from "@/lib/utils";

export function AdminFiltersBar({
  search,
  onSearchChange,
  searchPlaceholder = "Search…",
  searchDebounceMs = 350,
  children,
  className,
}: {
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  /**
   * Debounce (ms) before onSearchChange fires. Defaults to 350ms so EVERY admin search field
   * reports its value only after the user pauses typing — one API request per pause, not one per
   * keystroke. The input itself updates instantly (SearchBar holds local state), so it never loses
   * focus mid-typing. Pass 0 to report every keystroke immediately.
   */
  searchDebounceMs?: number;
  children?: ReactNode;
  className?: string;
}) {
  return (
    // Wrap-friendly, overlap-proof filters row. The whole bar can wrap; the search column and the
    // controls column are BOTH `min-w-0` so neither can overflow its track or push into the other.
    // Below lg the layout stacks (search on its own full-width row, controls beneath); at lg+ they
    // sit side by side and any control that doesn't fit wraps to the next line instead of clipping.
    <div
      className={cn(
        "mb-4 flex w-full min-w-0 flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center",
        className,
      )}
    >
      {onSearchChange !== undefined && (
        <div className="w-full min-w-0 lg:w-auto lg:flex-1 lg:max-w-sm">
          <SearchBar
            value={search ?? ""}
            onChange={onSearchChange}
            placeholder={searchPlaceholder}
            debounceMs={searchDebounceMs}
          />
        </div>
      )}
      {children && (
        <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>
      )}
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
