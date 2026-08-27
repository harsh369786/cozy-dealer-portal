import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requireRoles } from "@/lib/auth-guard";

export const Route = createFileRoute("/distributor")({
  beforeLoad: async () => {
    await requireRoles(["distributor", "sales_executive"]);
  },
  component: () => <Outlet />,
});
