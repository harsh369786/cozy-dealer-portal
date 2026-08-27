import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { useTranslation } from "react-i18next";
import { useFormat } from "@/hooks/use-format";

type Props = {
  fromDate?: string;
  toDate?: string;
  onChange: (from: string, to: string) => void;
  className?: string;
};

export function DateRangePicker({ fromDate, toDate, onChange, className }: Props) {
  const { t } = useTranslation();
  const { formatDisplayDate } = useFormat();
  const from = fromDate ?? "";
  const to = toDate ?? from;

  return (
    <div className={cn("flex flex-wrap items-end gap-2", className)}>
      <div className="min-w-[140px]">
        <p className="mb-1 text-xs font-semibold text-muted-foreground">{t("common.from")}</p>
        <Input
          type="date"
          value={from}
          onChange={(e) => {
            const nextFrom = e.target.value;
            onChange(nextFrom, to && to < nextFrom ? nextFrom : to);
          }}
          className="rounded-lg"
        />
        {from && <p className="mt-1 text-xs text-muted-foreground">{formatDisplayDate(from)}</p>}
      </div>
      <div className="min-w-[140px]">
        <p className="mb-1 text-xs font-semibold text-muted-foreground">{t("common.to")}</p>
        <Input
          type="date"
          value={to}
          min={from || undefined}
          onChange={(e) => onChange(from, e.target.value)}
          className="rounded-lg"
        />
        {to && <p className="mt-1 text-xs text-muted-foreground">{formatDisplayDate(to)}</p>}
      </div>
    </div>
  );
}

export function inDateRange(dateLabel: string, fromDate?: string, toDate?: string) {
  if (!fromDate && !toDate) return true;
  const d = new Date(dateLabel);
  if (Number.isNaN(d.getTime())) return true;
  if (fromDate) {
    const from = new Date(fromDate);
    from.setHours(0, 0, 0, 0);
    if (d < from) return false;
  }
  if (toDate) {
    const to = new Date(toDate);
    to.setHours(23, 59, 59, 999);
    if (d > to) return false;
  }
  return true;
}
