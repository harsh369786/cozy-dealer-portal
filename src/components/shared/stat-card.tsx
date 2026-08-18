import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  className,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "animate-rise rounded-3xl border border-border bg-card p-4 shadow-soft",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted-foreground">{label}</p>
          <p className="mt-1 truncate font-display text-xl font-bold">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
        </div>
        {Icon && (
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-secondary">
            <Icon className="h-5 w-5 text-primary" />
          </span>
        )}
      </div>
    </div>
  );
}
