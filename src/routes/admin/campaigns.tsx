import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/campaigns")({
  component: AdminCampaignsLayout,
});

function AdminCampaignsLayout() {
  return <Outlet />;
}
