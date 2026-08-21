import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/rewards")({
  component: AdminRewardsLayout,
});

function AdminRewardsLayout() {
  return <Outlet />;
}
