import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/settings")({
  component: AdminSettingsLayout,
});

function AdminSettingsLayout() {
  return <Outlet />;
}
