import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireRoles } from "@/lib/auth-guard";

export const Route = createFileRoute("/admin")({
  beforeLoad: () => requireRoles(["master_admin", "admin_staff"]),
  component: AdminLayout,
});

function AdminLayout() {
  return (
    <AdminShell>
      <Outlet />
    </AdminShell>
  );
}
