import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  className,
  valueTitle,
  onClick,
  href,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
  valueTitle?: string;
  onClick?: () => void;
  href?: string;
}) {
  const Wrapper = href ? "a" : onClick ? "button" : "div";
  const wrapperProps = href
    ? { href }
    : onClick
      ? { type: "button" as const, onClick }
      : {};

  return (
    <Wrapper
      {...wrapperProps}
      className={cn(
        "animate-rise block w-full rounded-xl border border-border bg-card p-4 text-left shadow-soft",
        (onClick || href) && "press cursor-pointer transition-colors hover:border-primary/40 hover:bg-secondary/30",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold leading-snug text-muted-foreground">{label}</p>
          <p
            className="mt-1 font-display text-base font-bold leading-none tabular-nums whitespace-nowrap sm:text-lg"
            title={valueTitle}
          >
            {value}
          </p>
          {sub && (
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground sm:text-xs">{sub}</p>
          )}
        </div>
        {Icon && (
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary">
            <Icon className="h-5 w-5 text-primary" />
          </span>
        )}
      </div>
    </Wrapper>
  );
}
