import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminSection } from "@/components/admin/admin-section";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useAsyncData } from "@/hooks/use-async-data";
import { useAdminPermissions } from "@/hooks/use-admin-permissions";
import { useFormatApiError } from "@/lib/api-errors";
import { getDealers } from "@/services/dealers";
import {
  creditDealerPoints,
  getDealerBalance,
  getRewardResetStatus,
  resetAllDealerRewards,
  type DealerBalanceSummary,
} from "@/services/admin/reward-points";

export const Route = createFileRoute("/admin/rewards/points")({
  component: RewardPointsPage,
});

function RewardPointsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isMasterAdmin, loading: permsLoading } = useAdminPermissions();

  // Defence in depth: this whole screen is master-admin only. The nav link is already gated, but
  // guard the route too so a direct visit by admin_staff/sales_head bounces back.
  useEffect(() => {
    if (!permsLoading && !isMasterAdmin) {
      navigate({ to: "/admin/rewards" });
    }
  }, [permsLoading, isMasterAdmin, navigate]);

  if (permsLoading || !isMasterAdmin) return null;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={t("admin.rewardPoints.title")}
        description={t("admin.rewardPoints.description")}
        actions={
          <Link to="/admin/rewards">
            <Button variant="outline" className="rounded-2xl font-bold">
              ← {t("admin.rewards.title")}
            </Button>
          </Link>
        }
      />

      <AddPointsSection />
      <ResetRewardsSection />
    </div>
  );
}

function AddPointsSection() {
  const { t } = useTranslation();
  const formatApiError = useFormatApiError();

  const dealersQuery = useAsyncData(() => getDealers(), []);
  const [dealerId, setDealerId] = useState("");
  const [points, setPoints] = useState("");
  const [reason, setReason] = useState("");
  const [summary, setSummary] = useState<DealerBalanceSummary | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const options = useMemo(
    () =>
      (dealersQuery.data ?? []).map((d) => ({
        value: d.id,
        label: `${d.name}${d.code ? ` · ${d.code}` : ""}`,
      })),
    [dealersQuery.data],
  );

  const pointsNum = Math.max(0, Math.floor(Number(points) || 0));
  const reasonTrimmed = reason.trim();
  const canSubmit = Boolean(dealerId) && pointsNum > 0 && reasonTrimmed.length > 0;

  // Load the selected dealer's current balance for the confirmation preview.
  useEffect(() => {
    let active = true;
    if (!dealerId) {
      setSummary(null);
      return;
    }
    getDealerBalance(dealerId)
      .then((s) => active && setSummary(s))
      .catch(() => active && setSummary(null));
    return () => {
      active = false;
    };
  }, [dealerId]);

  const newBalance = (summary?.balance ?? 0) + pointsNum;

  const submit = async () => {
    setBusy(true);
    try {
      const result = await creditDealerPoints({
        dealerId,
        points: pointsNum,
        reason: reasonTrimmed,
      });
      toast.success(
        t("admin.rewardPoints.creditSuccess", {
          points: result.pointsAdded.toLocaleString("en-IN"),
          name: result.dealerName,
        }),
      );
      setConfirmOpen(false);
      setPoints("");
      setReason("");
      setSummary((prev) => (prev ? { ...prev, balance: result.newBalance } : prev));
    } catch (err) {
      toast.error(formatApiError(err, "errors.somethingWentWrong"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminSection title={t("admin.rewardPoints.addTitle")} description={t("admin.rewardPoints.addDescription")}>
      <div className="grid max-w-2xl gap-4">
        <div>
          <Label className="mb-1 block">{t("admin.rewardPoints.selectDealer")}</Label>
          <SearchableSelect
            options={options}
            value={dealerId}
            onValueChange={setDealerId}
            placeholder={t("admin.rewardPoints.selectDealer")}
            searchPlaceholder={t("common.search")}
            disabled={dealersQuery.loading}
          />
          {summary && (
            <p className="mt-1 text-sm text-muted-foreground">
              {t("admin.rewardPoints.currentBalance")}:{" "}
              <span className="font-bold text-foreground">{summary.balance.toLocaleString("en-IN")}</span>
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="points" className="mb-1 block">
            {t("admin.rewardPoints.pointsToAdd")}
          </Label>
          <Input
            id="points"
            type="number"
            min={1}
            inputMode="numeric"
            value={points}
            onChange={(e) => setPoints(e.target.value)}
            className="rounded-lg"
            placeholder="0"
          />
        </div>

        <div>
          <Label htmlFor="reason" className="mb-1 block">
            {t("admin.rewardPoints.reason")} <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="min-h-20 rounded-lg"
            placeholder={t("admin.rewardPoints.reasonPlaceholder")}
          />
          <p className="mt-1 text-xs text-muted-foreground">{t("admin.rewardPoints.reasonHint")}</p>
        </div>

        <div>
          <Button className="rounded-2xl font-bold" disabled={!canSubmit} onClick={() => setConfirmOpen(true)}>
            {t("admin.rewardPoints.addPoints")}
          </Button>
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={(o) => !busy && setConfirmOpen(o)}>
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("admin.rewardPoints.confirmTitle")}</DialogTitle>
            <DialogDescription>{t("admin.rewardPoints.reviewTitle")}</DialogDescription>
          </DialogHeader>

          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-muted-foreground">{t("admin.rewardPoints.dealer")}</dt>
            <dd className="text-right font-semibold">{summary?.dealerName ?? "—"}</dd>
            <dt className="text-muted-foreground">{t("admin.rewardPoints.currentBalance")}</dt>
            <dd className="text-right font-semibold">{(summary?.balance ?? 0).toLocaleString("en-IN")}</dd>
            <dt className="text-muted-foreground">{t("admin.rewardPoints.pointsAdded")}</dt>
            <dd className="text-right font-semibold text-primary">+{pointsNum.toLocaleString("en-IN")}</dd>
            <dt className="text-muted-foreground">{t("admin.rewardPoints.newBalance")}</dt>
            <dd className="text-right font-bold">{newBalance.toLocaleString("en-IN")}</dd>
          </dl>
          <div className="rounded-2xl border border-border bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">{t("admin.rewardPoints.reason")}</p>
            <p className="mt-0.5 text-sm font-medium">{reasonTrimmed}</p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" className="rounded-2xl" onClick={() => setConfirmOpen(false)} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button className="rounded-2xl font-bold" onClick={submit} disabled={busy || !canSubmit}>
              {t("admin.rewardPoints.confirmCredit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminSection>
  );
}

function ResetRewardsSection() {
  const { t } = useTranslation();
  const formatApiError = useFormatApiError();
  const statusQuery = useAsyncData(() => getRewardResetStatus(), []);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const status = statusQuery.data;
  const alreadyReset = Boolean(status?.alreadyResetThisYear);
  const codeOk = code.trim() === "1410";

  const submit = async () => {
    setBusy(true);
    try {
      const result = await resetAllDealerRewards(code.trim());
      toast.success(t("admin.rewardPoints.resetSuccess", { count: result.dealersAffected }));
      setConfirmOpen(false);
      setCode("");
      statusQuery.retry();
    } catch (err) {
      toast.error(formatApiError(err, "admin.rewardPoints.resetFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminSection title={t("admin.rewardPoints.resetTitle")} description={t("admin.rewardPoints.resetDescription")}>
      <div className="max-w-2xl space-y-4">
        <div className="flex items-start gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="space-y-1 text-sm">
            <p className="font-bold text-destructive">{t("admin.rewardPoints.resetWarningTitle")}</p>
            <p className="text-muted-foreground">{t("admin.rewardPoints.resetWarningBody")}</p>
            <p className="text-muted-foreground">{t("admin.rewardPoints.resetPreservesHistory")}</p>
          </div>
        </div>

        {status && (
          <p className="text-sm text-muted-foreground">
            {t("admin.rewardPoints.rewardYear")}:{" "}
            <span className="font-bold text-foreground">{status.rewardYear}</span>
            {alreadyReset && status.lastReset && (
              <span className="ml-2 font-semibold text-destructive">
                {t("admin.rewardPoints.alreadyResetNotice", { count: status.lastReset.dealersAffected })}
              </span>
            )}
          </p>
        )}

        <Button
          variant="destructive"
          className="rounded-2xl font-bold"
          disabled={statusQuery.loading}
          onClick={() => {
            setCode("");
            setConfirmOpen(true);
          }}
        >
          {t("admin.rewardPoints.resetButton")}
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={(o) => !busy && setConfirmOpen(o)}>
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">
              {alreadyReset
                ? t("admin.rewardPoints.resetAgainTitle")
                : t("admin.rewardPoints.resetConfirmTitle")}
            </DialogTitle>
            <DialogDescription>
              {alreadyReset
                ? t("admin.rewardPoints.resetAgainWarning")
                : t("admin.rewardPoints.resetConfirmBody")}
            </DialogDescription>
          </DialogHeader>

          <div>
            <Label htmlFor="reset-code" className="mb-1 block text-sm font-bold">
              {t("admin.rewardPoints.enterResetCode")}
            </Label>
            <Input
              id="reset-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
              placeholder="••••"
              className="rounded-lg"
            />
            <p className="mt-1 text-xs text-muted-foreground">{t("admin.rewardPoints.resetCodeHint")}</p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" className="rounded-2xl" onClick={() => setConfirmOpen(false)} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              className="rounded-2xl font-bold"
              onClick={submit}
              disabled={busy || !codeOk}
            >
              {t("admin.rewardPoints.resetButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminSection>
  );
}
