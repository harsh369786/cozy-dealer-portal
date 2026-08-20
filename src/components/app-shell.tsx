import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Home, LayoutGrid, Package, Gift, Menu, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand";

const nav = [
  { to: "/home", label: "Home", icon: Home },
  { to: "/products", label: "Products", icon: LayoutGrid },
  { to: "/orders", label: "Orders", icon: Package },
  { to: "/rewards", label: "Rewards", icon: Gift },
  { to: "/campaigns", label: "More", icon: Menu },
] as const;

export function AppShell({
  children,
  title,
  back,
}: {
  children: ReactNode;
  title?: string;
  back?: string;
}) {
  const path = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <div className="mx-auto w-full max-w-[430px] pb-28 md:max-w-[520px]">
        <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-border/60 bg-background/90 px-5 py-3 backdrop-blur">
          {back ? (
            <Link
              to={back}
              className="press -ml-2 flex items-center gap-1 py-1 pr-2 text-base font-semibold"
            >
              <ChevronLeft className="h-6 w-6" />
              {title}
            </Link>
          ) : title ? (
            <h1 className="font-display text-xl font-bold">{title}</h1>
          ) : (
            <Logo size="sm" />
          )}
        </header>

        <main className="px-5 pt-5">{children}</main>
      </div>

      <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-[430px] -translate-x-1/2 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:max-w-[520px]">
        <ul className="grid grid-cols-5">
          {nav.map(({ to, label, icon: Icon }) => {
            const active =
              path === to ||
              (to !== "/home" && path.startsWith(to)) ||
              (to === "/campaigns" && path === "/profile");
            return (
              <li key={to}>
                <Link
                  to={to}
                  className={cn(
                    "press flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold",
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

export function Section({
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
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-display text-lg font-bold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
