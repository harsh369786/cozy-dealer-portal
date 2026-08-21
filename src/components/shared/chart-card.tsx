import type { ReactNode } from "react";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { cn } from "@/lib/utils";

export function ChartCard({
  title,
  description,
  config,
  children,
  className,
}: {
  title: string;
  description?: string;
  config: ChartConfig;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 overflow-hidden rounded-3xl border border-border bg-card p-4 shadow-soft", className)}>
      <div className="mb-3 min-w-0">
        <h3 className="font-display font-bold">{title}</h3>
        {description && <p className="break-words text-sm text-muted-foreground">{description}</p>}
      </div>
      <ChartContainer config={config} className="aspect-auto h-48 min-w-0 w-full md:h-56">
        {children}
      </ChartContainer>
    </div>
  );
}
