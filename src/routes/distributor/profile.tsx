import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { DistributorShell } from "@/components/distributor-shell";
import { useSession } from "@/hooks/use-session";
import { DISTRIBUTOR_ID, distributors } from "@/lib/mock/distributor/data";
import { Badge } from "@/components/ui/badge";
import { logout } from "@/services/auth";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/distributor/profile")({
  component: ProfilePage,
});

function roleLabel(role: string | undefined, t: (key: string) => string) {
  if (role === "sales_executive") return t("common.salesExecutive");
  if (role === "distributor") return t("common.distributor");
  if (role === "admin") return t("common.admin");
  if (role === "master_admin") return t("common.masterAdmin");
  if (role === "admin_staff") return t("common.adminStaff");
  return role ?? t("common.distributor");
}

function ProfilePage() {
  const { t } = useTranslation();
  const { user, role } = useSession();
  const dist = distributors[DISTRIBUTOR_ID];
  const navigate = useNavigate();

  return (
    <DistributorShell title={t("distributor.profile.title")} back="/distributor/more" showBell={false}>
      <div className="animate-rise space-y-5">
        <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
          <p className="font-display text-xl font-bold">{user?.name ?? dist?.name}</p>
          <p className="text-sm text-muted-foreground">{user?.phone ?? dist?.phone}</p>
          <Badge className="mt-3">{roleLabel(role, t)}</Badge>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("distributor.profile.regionLabel", { region: dist?.region ?? "—" })}
          </p>
        </div>

        <Button
          variant="outline"
          className="w-full rounded-2xl"
          onClick={async () => {
            await logout();
            navigate({ to: "/" });
          }}
        >
          {t("common.signOut")}
        </Button>
      </div>
    </DistributorShell>
  );
}
