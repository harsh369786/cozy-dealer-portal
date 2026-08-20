import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function AdminSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-3xl border border-border bg-card p-5 shadow-soft", className)}>
      <div className="mb-4">
        <h2 className="font-display text-lg font-bold">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}
