import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { BarChart3, Bell, ChevronLeft, Home, Menu, Package, Users } from "lucide-react";
import { Logo } from "@/components/brand";
import { cn } from "@/lib/utils";
import { getUnreadCount } from "@/services/notifications";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

const nav = [
  { to: "/distributor/dashboard", label: "Home", icon: Home, match: "/distributor/dashboard" },
  { to: "/distributor/orders", label: "Orders", icon: Package, match: "/distributor/orders" },
  { to: "/distributor/dealers", label: "Dealers", icon: Users, match: "/distributor/dealers" },
  { to: "/distributor/reports", label: "Reports", icon: BarChart3, match: "/distributor/reports" },
  { to: "/distributor/more", label: "More", icon: Menu, match: "/distributor/more" },
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
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    getUnreadCount()
      .then(setUnread)
      .catch(() => setUnread(0));
  }, [path]);

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
          {showBell && (
            <Link
              to="/distributor/notifications"
              className="press relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-secondary"
              aria-label="Notifications"
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
        </header>

        <main className="px-5 pt-5">{children}</main>
      </div>

      <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-[430px] -translate-x-1/2 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:max-w-3xl lg:max-w-6xl">
        <ul className="grid grid-cols-5">
          {nav.map(({ to, label, icon: Icon, match }) => {
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
                  {label}
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
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mt-7">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-bold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
