import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { LogOut, MapPin, Phone, Store } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { requireRoles } from "@/lib/auth-guard";
import { useSession } from "@/hooks/use-session";
import { useAsyncData } from "@/hooks/use-async-data";
import { useFormat } from "@/hooks/use-format";
import { getDealerById, getDealerPerformance } from "@/services/dealers";
import { logout } from "@/services/auth";
import { getRewardBalance } from "@/services/rewards";
import { PageSkeleton } from "@/components/shared/states";
import { PushNotificationToggle } from "@/components/shared/push-notification-toggle";

export const Route = createFileRoute("/profile")({
  beforeLoad: () => requireRoles(["dealer"]),
  component: DealerProfilePage,
});

function DealerProfilePage() {
  const { t } = useTranslation();
  const { formatCurrency, formatNumber } = useFormat();
  const { user } = useSession();
  const navigate = useNavigate();

  const { data: dealer, loading: dealerLoading } = useAsyncData(
    () => (user?.dealerId ? getDealerById(user.dealerId) : Promise.resolve(null)),
    [user?.dealerId],
  );

  const { data: balance, loading: balanceLoading } = useAsyncData(() => getRewardBalance(), []);

  const { data: performance, loading: performanceLoading } = useAsyncData(
    () => (user?.dealerId ? getDealerPerformance(user.dealerId) : Promise.resolve([])),
    [user?.dealerId],
  );

  const loading = dealerLoading || balanceLoading || performanceLoading;

  return (
    <AppShell title={t("dealer.profile.title")} back="/campaigns">
      {loading && <PageSkeleton rows={2} />}

      {!loading && (
        <div className="animate-rise space-y-4">
          <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
            <p className="font-display text-xl font-bold">{user?.name ?? t("common.dealer")}</p>
            <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <Phone className="h-4 w-4" />
              {user?.phone}
            </p>
            <Badge className="mt-3 capitalize">{t("common.dealer")}</Badge>
            {balance && (
              <p className="mt-3 text-sm font-bold text-primary">
                {t("common.rewardPointsBalance", { count: formatNumber(balance.balance) })}
              </p>
            )}
          </div>

          <PushNotificationToggle />

          {dealer && (
            <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
              <p className="flex items-center gap-2 font-display font-bold">
                <Store className="h-5 w-5 text-primary" />
                {dealer.name}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {t("dealer.profile.codeLabel", { code: dealer.code })}
              </p>
              <p className="mt-2 flex items-start gap-2 text-sm">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{dealer.address ?? dealer.location}</span>
              </p>
              {dealer.gstNumber && (
                <p className="mt-2 text-sm text-muted-foreground">
                  {t("dealer.profile.gstLabel", { gst: dealer.gstNumber })}
                </p>
              )}
            </div>
          )}

          {performance && performance.length > 0 ? (
            <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
              <p className="font-display text-lg font-bold">{t("common.myReports")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("common.monthlyPerformance")}</p>
              <div className="mt-4 space-y-2">
                {performance.map((row) => (
                  <div
                    key={row.month}
                    className="flex items-center justify-between rounded-2xl bg-secondary/60 px-3 py-2.5 text-sm"
                  >
                    <span className="font-semibold">{row.month}</span>
                    <div className="text-right">
                      <p className="font-bold">
                        {t("dealer.profile.ordersCount", { count: row.orders })}
                      </p>
                      <p className="text-xs text-muted-foreground">{formatCurrency(row.orderValue)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
              <p className="font-display text-lg font-bold">{t("common.myReports")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("common.monthlyTotalsPlaceholder")}</p>
            </div>
          )}

          <Button
            variant="outline"
            className="h-12 w-full rounded-2xl"
            onClick={async () => {
              await logout();
              navigate({ to: "/" });
            }}
          >
            <LogOut className="mr-2 h-4 w-4" />
            {t("common.signOut")}
          </Button>
        </div>
      )}
    </AppShell>
  );
}
