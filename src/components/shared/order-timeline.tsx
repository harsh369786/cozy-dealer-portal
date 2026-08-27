import type { OrderStatus } from "@/lib/mock/distributor/types";
import { Check } from "lucide-react";
import type { TimelineEvent } from "@/lib/mock/distributor/types";
import { useTranslation } from "react-i18next";
import { useFormat } from "@/hooks/use-format";
import { useTimelineEventLabel } from "@/lib/i18n-labels";
import { cn } from "@/lib/utils";

function TimelineEventRow({ event, isLast }: { event: TimelineEvent; isLast: boolean }) {
  const { t } = useTranslation();
  const { formatTimestamp } = useFormat();
  const label = useTimelineEventLabel(event);

  const rejected =
    event.status === "rejected" ||
    event.status === "cancelled" ||
    event.label === "Rejected" ||
    event.label === "Cancelled";
  const approved = event.status === "approved" || event.label === "Approved";
  const delivered = event.status === "delivered" || event.label === "Delivered";

  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center">
        <span
          className={cn(
            "grid h-8 w-8 place-items-center rounded-full border-2",
            rejected
              ? "border-destructive bg-destructive/10 text-destructive"
              : approved || delivered
                ? "border-success bg-success/10 text-success"
                : "border-primary bg-secondary text-primary",
          )}
        >
          <Check className="h-4 w-4" />
        </span>
        {!isLast && <span className="my-1 w-0.5 flex-1 bg-border" />}
      </div>
      <div className="pb-5 pt-1">
        <p className="font-semibold">{label}</p>
        {event.updatedBy && (
          <p className="text-sm text-muted-foreground">
            {t("common.updatedBy", { name: event.updatedBy })}
          </p>
        )}
        <p className="text-sm text-muted-foreground">{formatTimestamp(event.at)}</p>
        {event.note && <p className="mt-1 text-sm text-destructive">{event.note}</p>}
      </div>
    </li>
  );
}

export function OrderTimeline({ events }: { events: TimelineEvent[] }) {
  return (
    <ol className="space-y-0">
      {events.map((event, i) => (
        <TimelineEventRow key={`${event.label}-${i}`} event={event} isLast={i === events.length - 1} />
      ))}
    </ol>
  );
}

/** English fallback labels for non-React modules. Prefer useOrderStatusLabel in components. */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  order_placed: "Order Placed",
  approved: "Approved",
  in_making: "In Making",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  rejected: "Rejected",
  cancelled: "Cancelled",
};
