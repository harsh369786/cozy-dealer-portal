import type { ReactNode } from "react";
import { useEffect } from "react";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  Bell,
  ClipboardList,
  Gift,
  LayoutDashboard,
  Link2,
  LogOut,
  Megaphone,
  Package,
  ScrollText,
  Shield,
  ShoppingBag,
  Users,
} from "lucide-react";
import { Logo } from "@/components/brand";
import { Badge } from "@/components/ui/badge";
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
  label: string;
  icon: typeof LayoutDashboard;
  permission?: Permission;
  matchPrefix?: string;
}> = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, matchPrefix: "/admin" },
  { to: "/admin/users", label: "Users", icon: Users, permission: "users:read" },
  { to: "/admin/assignments", label: "Assignments", icon: Link2, permission: "assignments:read" },
  { to: "/admin/products", label: "Products", icon: Package, permission: "catalog:read" },
  { to: "/admin/orders", label: "Orders", icon: ShoppingBag, permission: "orders:read" },
  { to: "/admin/campaigns", label: "Campaigns", icon: Megaphone, permission: "campaigns:read" },
  { to: "/admin/rewards", label: "Rewards", icon: Gift, permission: "rewards:read" },
  { to: "/admin/complaints", label: "Complaints", icon: ClipboardList, permission: "complaints:read" },
  { to: "/admin/reports", label: "Reports", icon: BarChart3, permission: "reports:read" },
  { to: "/admin/notifications", label: "Notifications", icon: Bell, permission: "notifications:read" },
  { to: "/admin/audit-logs", label: "Audit Logs", icon: ScrollText, permission: "audit:read" },
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
  children,
  className,
}: {
  to: string;
  children: ReactNode;
  className?: string;
}) {
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <Link
      to={to}
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
  const { user } = useSession();
  const { can, isMasterAdmin } = useAdminPermissions();

  const visibleNav = NAV_ITEMS.filter((item) => {
    if (item.to === "/admin") return true;
    if (!item.permission) return true;
    return can(item.permission);
  });

  const handleLogout = async () => {
    await auth.logout();
    await router.navigate({ to: "/" });
  };

  const roleLabel = isMasterAdmin ? "Master Admin" : user?.role === "admin_staff" ? "Admin Staff" : user?.role;

  return (
    <SidebarProvider>
      <MobileSidebarAutoClose />
      <Sidebar className="border-r border-border/60 bg-card text-foreground">
        <SidebarHeader className="border-b border-border/60 p-4">
          <AdminNavLink to="/admin" className="flex items-center gap-2">
            <Logo size="sm" />
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-bold">BackRest Admin</p>
              <p className="truncate text-xs text-muted-foreground">Operations console</p>
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
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton asChild isActive={active} className="rounded-xl font-semibold">
                        <AdminNavLink to={item.to}>
                          <Icon className="h-4 w-4" />
                          <span>{item.label}</span>
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
                <p className="truncate text-sm font-bold">{user?.name ?? "Admin"}</p>
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
              Sign out
            </button>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="bg-background">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border/60 bg-background/90 px-4 backdrop-blur lg:px-6">
          <SidebarTrigger className="-ml-1" />
        </header>
        <main className={cn("mx-auto w-full max-w-7xl flex-1 p-4 lg:p-6")}>{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
