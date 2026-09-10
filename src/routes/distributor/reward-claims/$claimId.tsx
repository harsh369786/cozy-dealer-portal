import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CheckCircle2, XCircle, PackageCheck } from "lucide-react";
import { DistributorShell } from "@/components/distributor-shell";
import { RejectOrderDialog, ConfirmActionDialog } from "@/components/shared/dialogs";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { useAsyncData } from "@/hooks/use-async-data";
import { useFormatApiError } from "@/lib/api-errors";
import { RewardClaimStatusHistory } from "@/components/shared/reward-claim-history";
import { getRewardClaim, transitionRewardClaim } from "@/services/reward-claims";

export const Route = createFileRoute("/distributor/reward-claims/$claimId")({
  component: DistributorClaimDetailPage,
});

function DistributorClaimDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { claimId } = Route.useParams();
  const formatApiError = useFormatApiError();
  const [claim, setClaim] = useState<Awaited<ReturnType<typeof getRewardClaim>>>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const { loading, error, retry } = useAsyncData(async () => {
    const c = await getRewardClaim(claimId);
    setClaim(c);
    return c;
  }, [claimId]);

  const refresh = async () => setClaim(await getRewardClaim(claimId));

  const act = async (fn: () => Promise<unknown>, successKey: string) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
      toast.success(t(successKey));
      setRejectOpen(false);
      setApproveOpen(false);
      setDeliverOpen(false);
    } catch (err) {
      toast.error(formatApiError(err, "errors.somethingWentWrong"));
    } finally {
      setBusy(false);
    }
  };

  if (loading && !claim) return <PageSkeleton rows={4} />;
  if (error || !claim) {
    return (
      <DistributorShell title={t("distributor.rewardClaims.title")} showBell={false}>
        <ErrorState message={error ?? t("errors.notFound")} onRetry={retry} />
      </DistributorShell>
    );
  }

  const canApproveReject = claim.status === "pending_approval";
  const canDeliver = claim.status === "dispatched_from_factory";

  return (
    <DistributorShell title={t("distributor.rewardClaims.detailTitle")} showBell={false}>
      <div className="rounded-3xl border border-border bg-card p-4 shadow-soft">
        <div className="flex items-start gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-secondary text-xl">
            {claim.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg font-bold">{claim.rewardName}</p>
            <p className="text-sm text-muted-foreground">
              {claim.dealerName}
              {claim.dealerCode ? ` · ${claim.dealerCode}` : ""}
            </p>
            {claim.points > 0 && (
              <p className="mt-1 text-sm font-bold text-primary">
                {claim.points.toLocaleString("en-IN")} {t("common.points")}
              </p>
            )}
          </div>
        </div>

        {claim.status === "rejected" && claim.rejectionReason && (
          <p className="mt-3 rounded-2xl bg-destructive/5 px-3 py-2 text-sm font-semibold text-destructive">
            {t("common.rejectionReason")}: {claim.rejectionReason}
          </p>
        )}
      </div>

      <div className="mt-5">
        <h2 className="mb-3 font-display font-bold">{t("common.claimHistory")}</h2>
        <RewardClaimStatusHistory history={claim.history} />
      </div>

      {(canApproveReject || canDeliver) && (
        <div className="mt-6 flex flex-wrap gap-2">
          {canApproveReject && (
            <>
              <Button
                variant="outline"
                className="rounded-2xl font-bold"
                onClick={() => setRejectOpen(true)}
              >
                <XCircle className="mr-2 h-4 w-4" /> {t("common.reject")}
              </Button>
              <Button className="rounded-2xl font-bold" onClick={() => setApproveOpen(true)}>
                <CheckCircle2 className="mr-2 h-4 w-4" /> {t("common.approve")}
              </Button>
            </>
          )}
          {canDeliver && (
            <Button className="rounded-2xl font-bold" onClick={() => setDeliverOpen(true)}>
              <PackageCheck className="mr-2 h-4 w-4" /> {t("common.markDelivered")}
            </Button>
          )}
        </div>
      )}

      <ConfirmActionDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        title={t("distributor.rewardClaims.approveTitle")}
        description={t("distributor.rewardClaims.approveDescription", { name: claim.rewardName })}
        confirmLabel={t("common.approve")}
        loading={busy}
        onConfirm={() => act(() => transitionRewardClaim(claimId, "approved"), "distributor.rewardClaims.approved")}
      />

      <ConfirmActionDialog
        open={deliverOpen}
        onOpenChange={setDeliverOpen}
        title={t("distributor.rewardClaims.deliverTitle")}
        description={t("distributor.rewardClaims.deliverDescription", { name: claim.rewardName })}
        confirmLabel={t("common.markDelivered")}
        loading={busy}
        onConfirm={() => act(() => transitionRewardClaim(claimId, "delivered"), "distributor.rewardClaims.delivered")}
      />

      {/* Reject requires a reason (min length enforced by the dialog + server). */}
      <RejectOrderDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        loading={busy}
        onConfirm={(reason) =>
          act(() => transitionRewardClaim(claimId, "rejected", reason), "distributor.rewardClaims.rejected")
        }
      />

      <div className="mt-6">
        <Button
          variant="outline"
          className="rounded-2xl font-bold"
          onClick={() => navigate({ to: "/distributor/reward-claims" })}
        >
          ← {t("common.back")}
        </Button>
      </div>
    </DistributorShell>
  );
}
