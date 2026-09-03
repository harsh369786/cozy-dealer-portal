import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type MultiSelectOption = { value: string; label: string };

/**
 * Searchable multi-select dropdown (popover + command + checkbox rows) with Select All /
 * Clear All. Values are an array of selected option values; an empty array means "all"
 * semantically for reports (the trigger shows "All"). Kept generic + touch-friendly so it can
 * back every report filter. Options can be large — the command list is virtualisable/scrollable
 * and filtered by the built-in search.
 */
export function MultiSelect({
  label,
  options,
  selected,
  onChange,
  placeholderAll = "All",
  searchPlaceholder = "Search…",
  disabled,
  className,
}: {
  label?: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholderAll?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const toggle = (value: string) => {
    const next = new Set(selectedSet);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    // Preserve option order for stable output.
    onChange(options.filter((o) => next.has(o.value)).map((o) => o.value));
  };
  const selectAll = () => onChange(options.map((o) => o.value));
  const clearAll = () => onChange([]);

  const summary = useMemo(() => {
    if (selected.length === 0) return placeholderAll;
    if (selected.length === options.length && options.length > 0) return `All (${options.length})`;
    if (selected.length === 1) {
      return options.find((o) => o.value === selected[0])?.label ?? "1 selected";
    }
    return `${selected.length} selected`;
  }, [selected, options, placeholderAll]);

  return (
    <div className={cn("min-w-0", className)}>
      {label ? <p className="mb-1 text-xs font-semibold text-muted-foreground">{label}</p> : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="h-10 w-full justify-between gap-2 rounded-lg font-normal"
          >
            <span className={cn("truncate", selected.length === 0 && "text-muted-foreground")}>
              {summary}
            </span>
            <span className="flex shrink-0 items-center gap-1">
              {selected.length > 0 ? (
                <X
                  className="h-4 w-4 opacity-60 hover:opacity-100"
                  role="button"
                  aria-label="Clear"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    clearAll();
                  }}
                />
              ) : null}
              <ChevronsUpDown className="h-4 w-4 opacity-50" />
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[--radix-popover-trigger-width] min-w-[220px] p-0"
          align="start"
        >
          <Command
            filter={(value, search) => {
              // value is the option label (set via CommandItem value); case-insensitive contains.
              return value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
            }}
          >
            <CommandInput placeholder={searchPlaceholder} />
            <div className="flex items-center justify-between border-b px-2 py-1.5 text-xs">
              <button
                type="button"
                className="font-semibold text-primary hover:underline"
                onClick={selectAll}
                disabled={options.length === 0}
              >
                Select all
              </button>
              <button
                type="button"
                className="font-semibold text-muted-foreground hover:text-foreground hover:underline disabled:opacity-50"
                onClick={clearAll}
                disabled={selected.length === 0}
              >
                Clear all
              </button>
            </div>
            <CommandList>
              <CommandEmpty>No matches.</CommandEmpty>
              <CommandGroup>
                {options.map((option) => {
                  const isSelected = selectedSet.has(option.value);
                  return (
                    <CommandItem
                      key={option.value}
                      value={option.label}
                      onSelect={() => toggle(option.value)}
                      className="cursor-pointer"
                    >
                      <span
                        className={cn(
                          "flex h-4 w-4 items-center justify-center rounded border",
                          isSelected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-input",
                        )}
                      >
                        {isSelected ? <Check className="h-3 w-3" /> : null}
                      </span>
                      <span className="truncate">{option.label}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
