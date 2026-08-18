import { Check } from "lucide-react";
import type { TimelineEvent } from "@/lib/mock/distributor/types";
import { cn } from "@/lib/utils";

export function OrderTimeline({ events }: { events: TimelineEvent[] }) {
  return (
    <ol className="space-y-0">
      {events.map((event, i) => {
        const isLast = i === events.length - 1;
        const rejected = event.label === "Rejected";
        const approved = event.label === "Approved";
        return (
          <li key={`${event.label}-${i}`} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "grid h-8 w-8 place-items-center rounded-full border-2",
                  rejected
                    ? "border-destructive bg-destructive/10 text-destructive"
                    : approved
                      ? "border-success bg-success/10 text-success"
                      : "border-primary bg-secondary text-primary",
                )}
              >
                <Check className="h-4 w-4" />
              </span>
              {!isLast && <span className="my-1 w-0.5 flex-1 bg-border" />}
            </div>
            <div className="pb-5 pt-1">
              <p className="font-semibold">{event.label}</p>
              <p className="text-sm text-muted-foreground">{event.at}</p>
              {event.note && <p className="mt-1 text-sm text-destructive">{event.note}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
