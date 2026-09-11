import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

/**
 * A search input that is responsive to type into and (optionally) debounces the value it reports
 * upward.
 *
 * Why the local state: consumers typically feed the search value into a data hook's dependency
 * list. If the input were purely controlled by that same value, a parent re-render or a data hook
 * that briefly clears its data (showing a loading skeleton) would remount this input mid-typing and
 * steal focus. Keeping the typed value in local state means the box stays mounted and focused while
 * the parent refetches. The local value still SYNCS when the parent changes `value` externally
 * (e.g. a "clear" button elsewhere, or a tab switch that resets search), so it stays controlled.
 *
 * `debounceMs` (default 0 = report every keystroke immediately, preserving old behaviour) lets a
 * caller ask for the upward `onChange` to fire only after the user pauses typing — one API request
 * per pause instead of one per keystroke.
 */
export function SearchBar({
  value,
  onChange,
  placeholder,
  debounceMs = 0,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  debounceMs?: number;
}) {
  const [localValue, setLocalValue] = useState(value);
  // Latest onChange without making it a debounce-effect dependency (avoids resetting the timer when
  // the parent passes a new inline callback each render).
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Keep the box in sync when the parent changes the value from the OUTSIDE (clear button, reset,
  // tab switch). We only adopt the external value when it differs from what we're already showing,
  // so normal typing is never clobbered.
  useEffect(() => {
    setLocalValue((prev) => (prev === value ? prev : value));
  }, [value]);

  // Report the typed value upward, debounced when asked. When debounceMs is 0 this fires on the
  // same tick, matching the original immediate behaviour.
  useEffect(() => {
    if (localValue === value) return; // nothing new to report (in sync with parent)
    if (debounceMs <= 0) {
      onChangeRef.current(localValue);
      return;
    }
    const timer = window.setTimeout(() => onChangeRef.current(localValue), debounceMs);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localValue, debounceMs]);

  return (
    <div className="relative w-full min-w-0">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-lg border-border bg-card pl-10 pr-10 text-base shadow-soft"
      />
      {localValue && (
        <button
          type="button"
          onClick={() => {
            setLocalValue("");
            // Clearing should take effect immediately regardless of debounce.
            onChangeRef.current("");
          }}
          aria-label="Clear search"
          className="press absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-secondary"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function matchesSearch(query: string, ...fields: (string | undefined)[]) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => f?.toLowerCase().includes(q));
}
