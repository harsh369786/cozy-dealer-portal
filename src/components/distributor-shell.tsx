import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { BarChart3, Bell, ChevronLeft, Home, MapPin, Megaphone, Menu, Package, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Logo } from "@/components/brand";
import { cn } from "@/lib/utils";
import { useSession } from "@/hooks/use-session";
import { useUnreadNotificationCount } from "@/hooks/use-unread-notifications";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { LanguageSwitcher } from "@/components/shared/language-switcher";

const baseNav = [
  { to: "/distributor/dashboard", labelKey: "nav.distributor.home", icon: Home, match: "/distributor/dashboard" },
  { to: "/distributor/orders", labelKey: "nav.distributor.orders", icon: Package, match: "/distributor/orders" },
  { to: "/distributor/dealers", labelKey: "nav.distributor.dealers", icon: Users, match: "/distributor/dealers" },
  { to: "/distributor/reports", labelKey: "nav.distributor.reports", icon: BarChart3, match: "/distributor/reports" },
  { to: "/distributor/more", labelKey: "nav.distributor.more", icon: Menu, match: "/distributor/more" },
] as const;

const salesExecNav = [
  { to: "/distributor/dashboard", labelKey: "nav.distributor.home", icon: Home, match: "/distributor/dashboard" },
  { to: "/distributor/visits", labelKey: "nav.distributor.visits", icon: MapPin, match: "/distributor/visits" },
  { to: "/distributor/campaigns", labelKey: "nav.distributor.campaigns", icon: Megaphone, match: "/distributor/campaigns" },
  { to: "/distributor/orders", labelKey: "nav.distributor.orders", icon: Package, match: "/distributor/orders" },
  { to: "/distributor/more", labelKey: "nav.distributor.more", icon: Menu, match: "/distributor/more" },
] as const;

export function DistributorShell({
  children,
  title,
  back,
  showBell = true,
}: {
  children: ReactNode;
  title?: string;
  back?: string;
  showBell?: boolean;
}) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const reducedMotion = useReducedMotion();
  const unread = useUnreadNotificationCount();
  const { role } = useSession();
  const { t } = useTranslation();
  const nav = role === "sales_executive" ? salesExecNav : baseNav;

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <div className="mx-auto w-full max-w-[430px] pb-28 md:max-w-3xl lg:max-w-6xl">
        <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-border/60 bg-background/90 px-5 py-3 backdrop-blur">
          <div className="flex min-w-0 items-center gap-2">
            {back ? (
              <Link
                to={back}
                className="press -ml-2 flex min-w-0 items-center gap-1 py-1 pr-2 text-base font-semibold"
              >
                <ChevronLeft className="h-6 w-6 shrink-0" />
                <span className="truncate">{title}</span>
              </Link>
            ) : title ? (
              <h1 className="truncate font-display text-xl font-bold">{title}</h1>
            ) : (
              <Logo size="sm" />
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <LanguageSwitcher compact />
            {showBell && (
              <Link
                to="/distributor/notifications"
                className="press relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-secondary"
                aria-label={t("common.notifications")}
              >
                <Bell className="h-5 w-5 text-primary" />
                {unread > 0 && (
                  <span
                    className={cn(
                      "absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground",
                      !reducedMotion && "animate-pulse",
                    )}
                  >
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </Link>
            )}
          </div>
        </header>

        <main className="px-5 pt-5">{children}</main>
      </div>

      <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-[430px] -translate-x-1/2 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:max-w-3xl lg:max-w-6xl">
        <ul className="grid grid-cols-5">
          {nav.map(({ to, labelKey, icon: Icon, match }) => {
            const active =
              path === match || (match !== "/distributor/dashboard" && path.startsWith(match));
            return (
              <li key={to}>
                <Link
                  to={to}
                  className={cn(
                    "press flex min-h-[44px] flex-col items-center justify-center gap-1 py-2 text-[11px] font-semibold",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-9 w-14 place-items-center rounded-full transition-colors",
                      active && "bg-secondary",
                    )}
                  >
                    <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 2} />
                  </span>
                  {t(labelKey)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

export function DistSection({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mt-7">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-bold">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
