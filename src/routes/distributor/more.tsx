import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { BarChart3, Bell, ChevronRight, MapPin, Megaphone, MessageSquareWarning, User } from "lucide-react";
import { DistributorShell } from "@/components/distributor-shell";
import { PushNotificationToggle } from "@/components/shared/push-notification-toggle";
import { useSession } from "@/hooks/use-session";

export const Route = createFileRoute("/distributor/more")({
  component: MorePage,
});

function MorePage() {
  const { t } = useTranslation();
  const { role } = useSession();

  const links = useMemo(() => {
    const baseLinks = [
      {
        to: "/distributor/complaints" as const,
        label: t("nav.distributor.complaints"),
        icon: MessageSquareWarning,
        desc: t("distributor.more.complaintsDesc"),
      },
      {
        to: "/distributor/campaigns" as const,
        label: t("nav.distributor.campaigns"),
        icon: Megaphone,
        desc: t("distributor.more.campaignsDesc"),
      },
      {
        to: "/distributor/notifications" as const,
        label: t("nav.distributor.notifications"),
        icon: Bell,
        desc: t("distributor.more.notificationsDesc"),
      },
      {
        to: "/distributor/profile" as const,
        label: t("nav.distributor.profile"),
        icon: User,
        desc: t("distributor.more.profileDesc"),
      },
    ];

    if (role === "sales_executive") {
      return [
        {
          to: "/distributor/reports" as const,
          label: t("nav.distributor.reports"),
          icon: BarChart3,
          desc: t("distributor.more.reportsDesc"),
        },
        ...baseLinks,
      ];
    }

    // Distributors get a Dealer Visits entry (visits by their assigned sales executives).
    return [
      {
        to: "/distributor/dealer-visits" as const,
        label: t("distributor.dealerVisits.title"),
        icon: MapPin,
        desc: t("distributor.dealerVisits.moreDesc"),
      },
      ...baseLinks,
    ];
  }, [role, t]);

  return (
    <DistributorShell title={t("distributor.more.title")}>
      {role === "sales_executive" && (
        <Link
          to="/distributor/visits"
          className="press mb-4 flex items-center gap-4 rounded-3xl border-2 border-primary/30 bg-primary/5 p-4 shadow-soft"
        >
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <MapPin className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg font-bold">{t("distributor.dashboard.checkInVisit")}</p>
            <p className="text-sm text-muted-foreground">{t("distributor.more.checkInVisitShort")}</p>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-primary" />
        </Link>
      )}
      <div className="space-y-2">
        <PushNotificationToggle className="mb-2" />
        {links.map(({ to, label, icon: Icon, desc }) => (
          <Link
            key={to}
            to={to}
            className="press flex items-center gap-4 rounded-3xl border border-border bg-card p-4 shadow-soft"
          >
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-secondary">
              <Icon className="h-5 w-5 text-primary" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{label}</p>
              <p className="text-sm text-muted-foreground">{desc}</p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </DistributorShell>
  );
}
