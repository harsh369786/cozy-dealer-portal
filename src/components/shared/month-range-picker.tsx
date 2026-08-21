import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MONTHS = ["Mar", "Apr", "May", "Jun", "Jul", "Aug"] as const;

type Props = {
  fromMonth?: string;
  toMonth?: string;
  months?: string[];
  onChange: (from: string, to: string) => void;
  className?: string;
};

export function MonthRangePicker({ fromMonth, toMonth, months = [...MONTHS], onChange, className }: Props) {
  const from = fromMonth ?? months[months.length - 1] ?? "Aug";
  const to = toMonth ?? from;

  return (
    <div className={cn("flex flex-wrap items-end gap-2", className)}>
      <div className="min-w-[120px]">
        <p className="mb-1 text-xs font-semibold text-muted-foreground">From</p>
        <Select value={from} onValueChange={(v) => onChange(v, to < v ? v : to)}>
          <SelectTrigger className="rounded-lg">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {months.map((m) => (
              <SelectItem key={m} value={m}>
                {m} 2026
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="min-w-[120px]">
        <p className="mb-1 text-xs font-semibold text-muted-foreground">To</p>
        <Select value={to} onValueChange={(v) => onChange(from, v)}>
          <SelectTrigger className="rounded-lg">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {months.filter((m) => months.indexOf(m) >= months.indexOf(from)).map((m) => (
              <SelectItem key={m} value={m}>
                {m} 2026
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
