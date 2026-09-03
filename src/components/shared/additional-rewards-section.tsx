import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { ProgressBar } from "@/components/brand";
import { ConfirmActionDialog } from "@/components/shared/dialogs";
import { useAsyncData } from "@/hooks/use-async-data";
import { useFormat } from "@/hooks/use-format";
import { useFormatApiError } from "@/lib/api-errors";
import { resolveAssetUrl } from "@/lib/asset-url";
import { cn } from "@/lib/utils";
import {
  getAdditionalRewards,
  redeemReward,
  type AdditionalRewardItem,
} from "@/services/rewards";

export function AdditionalRewardsSection({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { formatNumber } = useFormat();
  const formatApiError = useFormatApiError();
  const { data, loading, retry } = useAsyncData(() => getAdditionalRewards(), []);
  const [confirm, setConfirm] = useState<AdditionalRewardItem | null>(null);
  const [claiming, setClaiming] = useState(false);

  if (loading && !data) return null;
  if (!data?.items.length) return null;

  return (
    <div className={cn("rounded-3xl border border-border bg-card p-5 shadow-lift", className)}>
      <p className="font-display text-xl font-bold">{t("common.additionalRewards")}</p>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t("common.additionalRewardsHint")}</p>
      <p className="mt-2 text-xs font-bold text-muted-foreground">
        {t("common.lifetimePointsChip", { count: formatNumber(data.lifetimeEarned) })}
      </p>

      {data.claimed ? (
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-primary/25 bg-primary/5 px-4 py-3">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground">
            <Check className="h-4 w-4" strokeWidth={2.5} />
          </span>
          <p className="text-sm font-semibold">
            {t("common.additionalRewardChosen", {
              emoji: data.claimed.emoji,
              name: data.claimed.name,
            })}
          </p>
        </div>
      ) : null}

      <div className="mt-4 space-y-2">
        {data.items.map((item, index) => {
          const chosen = data.claimed?.id === item.id;
          return (
            <div key={item.id}>
              {index > 0 ? (
                <p className="my-2 text-center text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  {t("common.additionalRewardsOr")}
                </p>
              ) : null}
              <div
                className={cn(
                  "flex flex-col rounded-2xl border bg-secondary/40 p-4",
                  chosen ? "border-primary/40 bg-primary/5" : "border-border/80",
                )}
              >
              <div className="flex items-start gap-3">
                {item.imageUrl ? (
                  <img
                    src={resolveAssetUrl(item.imageUrl)}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-xl object-cover"
                  />
                ) : (
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-card text-2xl shadow-soft">
                    {item.emoji}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-display font-bold leading-snug break-words">{item.name}</p>
                  <p className="mt-0.5 text-xs font-semibold text-muted-foreground">
                    {t("common.pointsRequired", { count: formatNumber(item.points) })}
                  </p>
                </div>
              </div>
              <ProgressBar value={item.pct} className="mt-3 h-1.5" />
              <p className="mt-2 text-xs text-muted-foreground">
                {item.remaining > 0
                  ? t("common.pointsToGo", { count: formatNumber(item.remaining) })
                  : data.claimed
                    ? chosen
                      ? t("common.additionalRewardYourPick")
                      : t("common.additionalRewardLockedChoice")
                    : t("common.readyToClaim")}
              </p>
              {item.eligible ? (
                <button
                  type="button"
                  onClick={() => setConfirm(item)}
                  className="press mt-3 w-full rounded-xl brand-gradient py-2.5 text-sm font-bold text-primary-foreground"
                >
                  {t("common.chooseThisReward")}
                </button>
              ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <ConfirmActionDialog
        open={!!confirm}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={t("common.chooseAdditionalTitle")}
        description={
          confirm
            ? t("common.chooseAdditionalDescription", {
                emoji: confirm.emoji,
                name: confirm.name,
                points: formatNumber(confirm.points),
              })
            : ""
        }
        confirmLabel={t("common.yesChooseIt")}
        loading={claiming}
        onConfirm={async () => {
          if (!confirm) return;
          setClaiming(true);
          try {
            await redeemReward(confirm.id);
            toast.success(t("common.rewardClaimed"));
            setConfirm(null);
            retry();
          } catch (err) {
            toast.error(formatApiError(err, "errors.couldNotRedeemReward"));
          } finally {
            setClaiming(false);
          }
        }}
      />
    </div>
  );
}
