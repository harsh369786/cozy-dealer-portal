import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFormat } from "@/hooks/use-format";
import { useRewardClaimStatusLabel } from "@/lib/i18n-labels";
import { cn } from "@/lib/utils";
import type { RewardClaimHistoryEntry } from "@/services/reward-claims";

/** Chronological reward-claim status history (claimed -> ... -> delivered / rejected). */
export function RewardClaimStatusHistory({ history }: { history: RewardClaimHistoryEntry[] }) {
  if (!history.length) return null;
  return (
    <ol className="space-y-0">
      {history.map((event, i) => (
        <HistoryRow key={`${event.status}-${i}`} event={event} isLast={i === history.length - 1} />
      ))}
    </ol>
  );
}

function HistoryRow({ event, isLast }: { event: RewardClaimHistoryEntry; isLast: boolean }) {
  const { t } = useTranslation();
  const { formatTimestamp } = useFormat();
  const label = useRewardClaimStatusLabel(event.status);
  const negative = event.status === "rejected" || event.status === "cancelled";
  const done = event.status === "delivered";
  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center">
        <span
          className={cn(
            "grid h-8 w-8 place-items-center rounded-full border-2",
            negative
              ? "border-destructive bg-destructive/10 text-destructive"
              : done
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
        {event.by && (
          <p className="text-sm text-muted-foreground">{t("common.updatedBy", { name: event.by })}</p>
        )}
        <p className="text-sm text-muted-foreground">{formatTimestamp(event.at)}</p>
        {event.note && <p className="mt-1 text-sm text-destructive">{event.note}</p>}
      </div>
    </li>
  );
}
