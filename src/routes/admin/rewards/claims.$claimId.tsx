import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminSection } from "@/components/admin/admin-section";
import { ConfirmActionDialog, RejectOrderDialog } from "@/components/shared/dialogs";
import { RewardClaimStatusHistory } from "@/components/shared/reward-claim-history";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAdminPermissions } from "@/hooks/use-admin-permissions";
import { useAsyncData } from "@/hooks/use-async-data";
import { useFormatApiError } from "@/lib/api-errors";
import { useRewardClaimStatusLabel, REWARD_CLAIM_STATUS_STYLES } from "@/lib/i18n-labels";
import { normalizeRewardClaimStatus, type RewardClaimStatus } from "../../../../shared/reward-claim-status";
import { getRewardClaim, transitionRewardClaim } from "@/services/reward-claims";

export const Route = createFileRoute("/admin/rewards/claims/$claimId")({
  component: AdminClaimDetailPage,
});

function AdminClaimDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { claimId } = Route.useParams();
  const { can, isMasterAdmin } = useAdminPermissions();
  const formatApiError = useFormatApiError();
  const [claim, setClaim] = useState<Awaited<ReturnType<typeof getRewardClaim>>>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{ to: RewardClaimStatus; titleKey: string } | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);

  const { loading, error, retry } = useAsyncData(async () => {
    const c = await getRewardClaim(claimId);
    setClaim(c);
    return c;
  }, [claimId]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      setClaim(await getRewardClaim(claimId));
      setConfirm(null);
      setRejectOpen(false);
      toast.success(t("common.statusUpdated"));
    } catch (err) {
      toast.error(formatApiError(err, "errors.somethingWentWrong"));
    } finally {
      setBusy(false);
    }
  };

  if (loading && !claim) return <PageSkeleton rows={4} />;
  if (error || !claim) return <ErrorState message={error ?? t("errors.notFound")} onRetry={retry} />;

  const s = normalizeRewardClaimStatus(claim.status);
  const canProcess = can("rewards:process");
  const canDeliver = can("rewards:deliver");

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={claim.rewardName}
        description={`${claim.dealerName}${claim.dealerCode ? ` · ${claim.dealerCode}` : ""}`}
        actions={
          <div className="flex items-center gap-2">
            <ClaimBadge status={s} />
            <Link to="/admin/rewards/claims">
              <Button variant="outline" className="rounded-2xl font-bold">← {t("common.back")}</Button>
            </Link>
          </div>
        }
      />

      <AdminSection title={t("common.claimDetails")}>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <Field label={t("common.customer")} value={claim.dealerName} />
          <Field label={t("admin.rewards.distributor")} value={claim.distributorName ?? "—"} />
          <Field label={t("common.points")} value={claim.points.toLocaleString("en-IN")} />
          <Field label={t("common.reward")} value={`${claim.emoji} ${claim.rewardName}`} />
          {s === "rejected" && claim.rejectionReason && (
            <div className="sm:col-span-2">
              <p className="text-muted-foreground">{t("common.rejectionReason")}</p>
              <p className="mt-0.5 font-semibold text-destructive">{claim.rejectionReason}</p>
            </div>
          )}
        </div>
      </AdminSection>

      <AdminSection title={t("common.claimHistory")}>
        <RewardClaimStatusHistory history={claim.history} />
      </AdminSection>

      {/* Admin staff process/dispatch; master_admin can also approve/reject/deliver as an override. */}
      <div className="flex flex-wrap gap-2">
        {canProcess && s === "approved" && (
          <Button
            className="rounded-2xl font-bold"
            onClick={() => setConfirm({ to: "processing", titleKey: "admin.rewards.markProcessing" })}
          >
            {t("admin.rewards.markProcessing")}
          </Button>
        )}
        {canProcess && s === "processing" && (
          <Button
            className="rounded-2xl font-bold"
            onClick={() =>
              setConfirm({ to: "dispatched_from_factory", titleKey: "admin.rewards.markDispatched" })
            }
          >
            {t("admin.rewards.markDispatched")}
          </Button>
        )}
        {isMasterAdmin && s === "pending_approval" && (
          <>
            <Button variant="outline" className="rounded-2xl font-bold" onClick={() => setRejectOpen(true)}>
              {t("common.reject")}
            </Button>
            <Button
              className="rounded-2xl font-bold"
              onClick={() => setConfirm({ to: "approved", titleKey: "common.approve" })}
            >
              {t("common.approve")}
            </Button>
          </>
        )}
        {canDeliver && s === "dispatched_from_factory" && (
          <Button
            className="rounded-2xl font-bold"
            onClick={() => setConfirm({ to: "delivered", titleKey: "common.markDelivered" })}
          >
            {t("common.markDelivered")}
          </Button>
        )}
      </div>

      <ConfirmActionDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm ? t(confirm.titleKey) : ""}
        description={t("admin.rewards.confirmTransition", { name: claim.rewardName })}
        confirmLabel={confirm ? t(confirm.titleKey) : ""}
        loading={busy}
        onConfirm={() => confirm && run(() => transitionRewardClaim(claimId, confirm.to))}
      />

      <RejectOrderDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        loading={busy}
        onConfirm={(reason) => run(() => transitionRewardClaim(claimId, "rejected", reason))}
      />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-semibold">{value}</p>
    </div>
  );
}

function ClaimBadge({ status }: { status: RewardClaimStatus }) {
  const label = useRewardClaimStatusLabel(status);
  return <Badge className={`${REWARD_CLAIM_STATUS_STYLES[status]} border-0 font-bold`}>{label}</Badge>;
}
