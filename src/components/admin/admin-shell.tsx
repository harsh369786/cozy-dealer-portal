import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  BarChart3,
  Bell,
  ClipboardList,
  Contact,
  Gift,
  IndianRupee,
  LayoutDashboard,
  Link2,
  LogOut,
  MapPin,
  Megaphone,
  Package,
  ScrollText,
  Shield,
  ShoppingBag,
  Users,
} from "lucide-react";
import { Logo } from "@/components/brand";
import { Badge } from "@/components/ui/badge";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { useUnreadNotificationCount } from "@/hooks/use-unread-notifications";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import type { Permission } from "@/lib/admin/rbac";
import { cn } from "@/lib/utils";
import { useAdminPermissions } from "@/hooks/use-admin-permissions";
import { useSession } from "@/hooks/use-session";
import * as auth from "@/services/auth";

const NAV_ITEMS: Array<{
  to: string;
  search?: Record<string, string>;
  labelKey: string;
  icon: typeof LayoutDashboard;
  permission?: Permission;
  matchPrefix?: string;
}> = [
  { to: "/admin", labelKey: "nav.admin.dashboard", icon: LayoutDashboard, matchPrefix: "/admin" },
  { to: "/admin/users", labelKey: "nav.admin.users", icon: Users, permission: "users:read" },
  {
    to: "/admin/assignments",
    search: { tab: "approvals" },
    labelKey: "nav.admin.pendingSignups",
    icon: ClipboardList,
    permission: "signup:review",
    matchPrefix: "/admin/assignments",
  },
  { to: "/admin/assignments", labelKey: "nav.admin.assignments", icon: Link2, permission: "assignments:read" },
  { to: "/admin/products", labelKey: "nav.admin.products", icon: Package, permission: "catalog:read" },
  { to: "/admin/pricing/tiers", labelKey: "nav.admin.pricing", icon: IndianRupee, permission: "catalog:read", matchPrefix: "/admin/pricing" },
  { to: "/admin/orders", labelKey: "nav.admin.orders", icon: ShoppingBag, permission: "orders:read" },
  { to: "/admin/campaigns", labelKey: "nav.admin.campaigns", icon: Megaphone, permission: "campaigns:read" },
  { to: "/admin/rewards", labelKey: "nav.admin.rewards", icon: Gift, permission: "rewards:read" },
  { to: "/admin/complaints", labelKey: "nav.admin.complaints", icon: ClipboardList, permission: "complaints:read" },
  { to: "/admin/visits", labelKey: "nav.admin.dealerVisits", icon: MapPin, permission: "visits:read", matchPrefix: "/admin/visits" },
  {
    to: "/admin/sales-executives",
    labelKey: "nav.admin.salesExecutives",
    icon: Contact,
    permission: "dealers:read",
    matchPrefix: "/admin/sales-executives",
  },
  { to: "/admin/reports", labelKey: "nav.admin.reports", icon: BarChart3, permission: "reports:read" },
  { to: "/admin/notifications", labelKey: "nav.admin.notifications", icon: Bell, permission: "notifications:read" },
  { to: "/admin/audit-logs", labelKey: "nav.admin.auditLogs", icon: ScrollText, permission: "audit:read" },
];

function isActive(path: string, to: string, matchPrefix?: string) {
  if (to === "/admin") return path === "/admin" || path === "/admin/";
  const prefix = matchPrefix ?? to;
  return path === to || path.startsWith(`${prefix}/`);
}

function MobileSidebarAutoClose() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { isMobile, setOpenMobile } = useSidebar();

  useEffect(() => {
    if (isMobile) setOpenMobile(false);
  }, [path, isMobile, setOpenMobile]);

  return null;
}

function AdminNavLink({
  to,
  search,
  children,
  className,
}: {
  to: string;
  search?: Record<string, string>;
  children: ReactNode;
  className?: string;
}) {
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <Link
      to={to}
      search={search}
      className={className}
      onClick={() => {
        if (isMobile) setOpenMobile(false);
      }}
    >
      {children}
    </Link>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const router = useRouter();
  const { t } = useTranslation();
  const { user } = useSession();
  const { can, isMasterAdmin } = useAdminPermissions();
  const unread = useUnreadNotificationCount();

  const visibleNav = NAV_ITEMS.filter((item) => {
    if (item.to === "/admin") return true;
    if (!item.permission) return true;
    return can(item.permission);
  });

  const handleLogout = async () => {
    await auth.logout();
    await router.navigate({ to: "/" });
  };

  const roleLabel = isMasterAdmin
    ? t("common.masterAdmin")
    : user?.role === "admin_staff"
      ? t("common.adminStaff")
      : user?.role;

  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <MobileSidebarAutoClose />
      <Sidebar className="border-r border-border/60 bg-card text-foreground">
        <SidebarHeader className="border-b border-border/60 p-4">
          <AdminNavLink to="/admin" className="flex items-center gap-2">
            <Logo size="sm" />
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-bold">{t("nav.admin.backRestAdmin")}</p>
              <p className="truncate text-xs text-muted-foreground">{t("nav.admin.operationsConsole")}</p>
            </div>
          </AdminNavLink>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleNav.map((item) => {
                  const active = isActive(path, item.to, item.matchPrefix);
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={`${item.to}-${item.labelKey}`}>
                      <SidebarMenuButton asChild isActive={active} className="rounded-xl font-semibold">
                        <AdminNavLink to={item.to} search={item.search}>
                          <Icon className="h-4 w-4" />
                          <span>{t(item.labelKey)}</span>
                        </AdminNavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="border-t border-border/60 p-3">
          <div className="rounded-2xl bg-secondary/60 p-3">
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10">
                <Shield className="h-4 w-4 text-primary" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{user?.name ?? t("common.admin")}</p>
                <Badge variant="secondary" className="mt-0.5 text-[10px] capitalize">
                  {roleLabel}
                </Badge>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card py-2 text-sm font-bold text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
              {t("admin.shell.signOut")}
            </button>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-h-0 overflow-hidden bg-background">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border/60 bg-background/90 px-4 backdrop-blur lg:px-6">
          <SidebarTrigger className="-ml-1" />
          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitcher compact />
            <Link
              to="/admin/notifications"
              className="press relative grid h-10 w-10 place-items-center rounded-full bg-secondary"
              aria-label={t("common.notifications")}
            >
              <Bell className="h-5 w-5 text-primary" />
              {unread > 0 && (
                <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </Link>
          </div>
        </header>
        <main className={cn("mx-auto min-h-0 w-full max-w-7xl flex-1 overflow-y-auto p-4 pb-8 lg:p-6 lg:pb-10")}>
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
